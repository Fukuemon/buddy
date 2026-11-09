-- name: EnqueueScheduleExport :exec
-- 終わっていない待ちがあれば積み直す。失敗した待ちは数え直し、確認が必要な待ちは状態と書く時刻を変えない。
INSERT INTO calendar_exports (id, facility_id, schedule_id) VALUES ($1, $2, $3)
ON CONFLICT (schedule_id) WHERE status <> 'succeeded' AND schedule_id IS NOT NULL
DO UPDATE SET
    revision = calendar_exports.revision + 1,
    status = CASE WHEN calendar_exports.status = 'failed' THEN 'pending' ELSE calendar_exports.status END,
    attempts = CASE WHEN calendar_exports.status = 'failed' THEN 0 ELSE calendar_exports.attempts END,
    error_code = CASE WHEN calendar_exports.status = 'failed' THEN NULL ELSE calendar_exports.error_code END,
    next_attempt_at = CASE WHEN calendar_exports.status = 'conflict' THEN calendar_exports.next_attempt_at ELSE now() END;

-- name: EnqueueRecurringScheduleExport :exec
INSERT INTO calendar_exports (id, facility_id, recurring_schedule_id) VALUES ($1, $2, $3)
ON CONFLICT (recurring_schedule_id) WHERE status <> 'succeeded' AND recurring_schedule_id IS NOT NULL
DO UPDATE SET
    revision = calendar_exports.revision + 1,
    status = CASE WHEN calendar_exports.status = 'failed' THEN 'pending' ELSE calendar_exports.status END,
    attempts = CASE WHEN calendar_exports.status = 'failed' THEN 0 ELSE calendar_exports.attempts END,
    error_code = CASE WHEN calendar_exports.status = 'failed' THEN NULL ELSE calendar_exports.error_code END,
    next_attempt_at = CASE WHEN calendar_exports.status = 'conflict' THEN calendar_exports.next_attempt_at ELSE now() END;

-- name: ClaimCalendarExports :many
-- 複数の処理が同時に取っても同じ待ちを渡さないよう、行をロックできたものだけを取る。
UPDATE calendar_exports
SET locked_until = now() + make_interval(secs => sqlc.arg(lease_seconds)::float8), attempts = attempts + 1
WHERE id IN (
    SELECT e.id FROM calendar_exports e
    WHERE e.status = 'pending' AND e.next_attempt_at <= now() AND (e.locked_until IS NULL OR e.locked_until <= now())
    ORDER BY e.next_attempt_at, e.id
    LIMIT sqlc.arg(max_count)
    FOR UPDATE SKIP LOCKED
)
RETURNING *;

-- 結果を書く 3 つのクエリは、取ったときの attempts と比べ、lease が切れた後にほかの処理が取り直した待ちを変えない。
-- 書いている間に積み直された待ち（revision が違う）は、結果を書かずに ReleaseCalendarExport で数え直す。

-- name: SucceedCalendarExport :execrows
UPDATE calendar_exports
SET status = 'succeeded', error_code = NULL, locked_until = NULL, overwrite = false, writing_calendar_id = NULL, finished_at = now()
WHERE id = sqlc.arg(id) AND revision = sqlc.arg(revision) AND attempts = sqlc.arg(attempts);

-- name: FailCalendarExport :execrows
UPDATE calendar_exports
SET status = sqlc.arg(status), error_code = sqlc.narg(error_code), locked_until = NULL,
    next_attempt_at = now() + make_interval(secs => sqlc.arg(retry_after_seconds)::float8)
WHERE id = sqlc.arg(id) AND revision = sqlc.arg(revision) AND attempts = sqlc.arg(attempts);

-- name: ReleaseCalendarExport :exec
UPDATE calendar_exports
SET locked_until = NULL, attempts = 0, overwrite = false, error_code = NULL, next_attempt_at = now()
WHERE id = sqlc.arg(id) AND attempts = sqlc.arg(attempts) AND status = 'pending';

-- name: UnclaimCalendarExport :exec
-- 止める合図で書けなかった待ちを、書こうとした回数に数えずに返す。
UPDATE calendar_exports
SET locked_until = NULL, attempts = attempts - 1
WHERE id = sqlc.arg(id) AND attempts = sqlc.arg(attempts) AND attempts > 0;

-- name: GetCalendarExport :one
SELECT * FROM calendar_exports WHERE id = $1;

-- name: RetryCalendarExport :execrows
UPDATE calendar_exports
SET status = 'pending', overwrite = true, attempts = 0, error_code = NULL, locked_until = NULL, next_attempt_at = now()
WHERE id = $1 AND status IN ('conflict', 'failed');

-- name: ListCalendarExportIssues :many
-- 予定のタイトルと利用者名は読まない。
-- 削除した予定の待ちは、予定の時刻を持たないので出さない。職員の結合で外れる（ADR-0040）。
SELECT e.*,
       (sc.id IS NOT NULL)::boolean AS cancelled,
       u.id AS staff_id, u.username AS staff_name,
       COALESCE(s.date, rs.date)::date AS date,
       COALESCE(s.start_time, rs.start_time)::time AS start_time,
       COALESCE(s.end_time, rs.end_time)::time AS end_time,
       COALESCE(s.ends_next_day, rs.ends_next_day)::boolean AS ends_next_day
FROM calendar_exports e
LEFT JOIN schedules s ON s.id = e.schedule_id
LEFT JOIN schedule_cancels sc ON sc.schedule_id = e.schedule_id
LEFT JOIN recurring_schedules rs ON rs.id = e.recurring_schedule_id
JOIN users u ON u.id = COALESCE(s.staff_id, rs.staff_id)
WHERE e.facility_id = $1 AND e.status IN ('conflict', 'failed')
ORDER BY e.updated_at DESC, e.id;

-- name: GetOpenScheduleExport :one
SELECT * FROM calendar_exports WHERE schedule_id = $1 AND status <> 'succeeded';

-- name: GetOpenRecurringScheduleExport :one
SELECT * FROM calendar_exports WHERE recurring_schedule_id = $1 AND status <> 'succeeded';

-- name: CalendarExportBacklog :one
-- 書いていない待ち（pending）の数と、最も古い待ちを積んでからの秒数を返す。確認が必要な待ち（conflict と failed）は、
-- 職員が選ぶまで書かないので数えない。待ちが無ければ秒数は 0 である。
SELECT count(*)::int AS pending_count,
       COALESCE(EXTRACT(EPOCH FROM now() - min(created_at)), 0)::float8 AS oldest_age_seconds
FROM calendar_exports
WHERE status = 'pending';

-- name: GetCalendarExportFacilityID :one
-- access がパスの ID のリソースの事業所を確認するときに、事業所だけを読む。
SELECT facility_id FROM calendar_exports WHERE id = $1;

-- name: EnqueueDeletedScheduleExport :exec
INSERT INTO calendar_exports (id, facility_id, deleted_schedule_id) VALUES ($1, $2, $3)
ON CONFLICT (deleted_schedule_id) WHERE status <> 'succeeded' AND deleted_schedule_id IS NOT NULL
DO UPDATE SET
    revision = calendar_exports.revision + 1,
    status = CASE WHEN calendar_exports.status = 'failed' THEN 'pending' ELSE calendar_exports.status END,
    attempts = CASE WHEN calendar_exports.status = 'failed' THEN 0 ELSE calendar_exports.attempts END,
    error_code = CASE WHEN calendar_exports.status = 'failed' THEN NULL ELSE calendar_exports.error_code END,
    next_attempt_at = CASE WHEN calendar_exports.status = 'conflict' THEN calendar_exports.next_attempt_at ELSE now() END;

-- name: MoveScheduleExportToDeletion :exec
-- 予定の行を消す前に、終わっていない待ちを削除の待ちに付け替える（#964）。予定の行を消すと、待ちは ON DELETE CASCADE で消えるためである。
-- 付け替えた待ちは、書いている処理の lease が解けるまで取られないので、作っている途中の外部の予定を、作り終えた後に消せる。
-- 削除は外部の変更より優先するので、確認が必要な待ちも pending に戻し、書き直しの回数を数え直す。
-- 書いている処理が lease を持つ待ちだけは回数を保つ。その処理の Finish が、取ったときの回数と比べて revision の違いを見つけ、Release で数え直すためである。
UPDATE calendar_exports
SET deleted_schedule_id = schedule_id, schedule_id = NULL, revision = revision + 1, status = 'pending',
    attempts = CASE WHEN status = 'pending' AND locked_until > now() THEN attempts ELSE 0 END, error_code = NULL, next_attempt_at = now()
WHERE schedule_id = $1 AND status <> 'succeeded';

-- name: MarkCalendarExportWriting :execrows
-- 外部の予定を作る前に、作る先のカレンダーを書く。取ったときの attempts と比べ、取り直された待ちは変えない。
UPDATE calendar_exports SET writing_calendar_id = sqlc.arg(writing_calendar_id)
WHERE id = sqlc.arg(id) AND attempts = sqlc.arg(attempts);
