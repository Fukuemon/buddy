-- name: EnqueueScheduleExport :exec
-- 終わっていない待ちがあれば積み直す。失敗した待ちは数え直し、確かめが要る待ちは状態と書く時刻を変えない。
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
SET status = 'succeeded', error_code = NULL, locked_until = NULL, overwrite = false, finished_at = now()
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
-- 予定の題名と利用者名は読まない。
SELECT e.*,
       u.id AS staff_id, u.username AS staff_name,
       COALESCE(s.date, rs.date)::date AS date,
       COALESCE(s.start_time, rs.start_time)::time AS start_time,
       COALESCE(s.end_time, rs.end_time)::time AS end_time
FROM calendar_exports e
LEFT JOIN schedules s ON s.id = e.schedule_id
LEFT JOIN recurring_schedules rs ON rs.id = e.recurring_schedule_id
JOIN users u ON u.id = COALESCE(s.staff_id, rs.staff_id)
WHERE e.facility_id = $1 AND e.status IN ('conflict', 'failed')
ORDER BY e.updated_at DESC, e.id;

-- name: HoldScheduleExport :exec
-- 外部の変更と buddy の変更が重なった予定を、確かめが要る待ちにする。書いている処理の結果は revision の違いで捨てる。
INSERT INTO calendar_exports (id, facility_id, schedule_id, status, error_code) VALUES ($1, $2, $3, 'conflict', $4)
ON CONFLICT (schedule_id) WHERE status <> 'succeeded' AND schedule_id IS NOT NULL
DO UPDATE SET
    revision = calendar_exports.revision + 1, status = 'conflict', error_code = EXCLUDED.error_code,
    overwrite = false, locked_until = NULL;

-- name: HoldRecurringScheduleExport :exec
INSERT INTO calendar_exports (id, facility_id, recurring_schedule_id, status, error_code) VALUES ($1, $2, $3, 'conflict', $4)
ON CONFLICT (recurring_schedule_id) WHERE status <> 'succeeded' AND recurring_schedule_id IS NOT NULL
DO UPDATE SET
    revision = calendar_exports.revision + 1, status = 'conflict', error_code = EXCLUDED.error_code,
    overwrite = false, locked_until = NULL;

-- name: GetOpenScheduleExport :one
SELECT * FROM calendar_exports WHERE schedule_id = $1 AND status <> 'succeeded';

-- name: GetOpenRecurringScheduleExport :one
SELECT * FROM calendar_exports WHERE recurring_schedule_id = $1 AND status <> 'succeeded';

-- name: ResolveCalendarExport :execrows
-- 外部の内容を buddy に当てた、確かめが要る待ちを終える。
UPDATE calendar_exports
SET status = 'succeeded', error_code = NULL, overwrite = false, locked_until = NULL, finished_at = now()
WHERE id = $1 AND status IN ('conflict', 'failed');
