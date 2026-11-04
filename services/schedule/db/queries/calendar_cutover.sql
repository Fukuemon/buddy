-- name: CreateCalendarCutover :exec
INSERT INTO calendar_cutovers (id, facility_id, status, range_start, started_by)
VALUES (sqlc.arg(id), sqlc.arg(facility_id), 'open', sqlc.arg(range_start), sqlc.arg(started_by));

-- name: GetCalendarCutover :one
SELECT * FROM calendar_cutovers WHERE id = $1;

-- name: FindOpenCalendarCutover :one
SELECT * FROM calendar_cutovers WHERE facility_id = $1 AND status = 'open';

-- name: FinishCalendarCutover :one
-- open の切り替えだけを終える。終えた切り替えでは行を返さない。
UPDATE calendar_cutovers SET status = sqlc.arg(status), finished_at = now()
WHERE id = sqlc.arg(id) AND status = 'open'
RETURNING *;

-- name: GetCalendarCutoverFacilityID :one
-- access がパスの ID のリソースの事業所を確認するときに、事業所だけを読む。
SELECT facility_id FROM calendar_cutovers WHERE id = $1;

-- name: ListLatestCutoverImportRuns :many
-- 切り替えの取り込みのうち、カレンダーごとに、最も新しく終えた成功した取り込みを返す。
SELECT DISTINCT ON (external_calendar_id) * FROM import_runs
WHERE cutover_id = sqlc.arg(cutover_id) AND status = 'succeeded'
ORDER BY external_calendar_id, finished_at DESC, id DESC;

-- name: DeleteCalendarCutoverSkips :exec
DELETE FROM calendar_cutover_skips WHERE cutover_id = sqlc.arg(cutover_id) AND external_calendar_id = sqlc.arg(external_calendar_id);

-- name: CreateCalendarCutoverSkip :exec
INSERT INTO calendar_cutover_skips (cutover_id, facility_id, external_calendar_id, external_event_id, revision)
VALUES (sqlc.arg(cutover_id), sqlc.arg(facility_id), sqlc.arg(external_calendar_id), sqlc.arg(external_event_id), sqlc.arg(revision));

-- name: ListCalendarCutoverSkips :many
SELECT * FROM calendar_cutover_skips
WHERE cutover_id = sqlc.arg(cutover_id) AND external_calendar_id = sqlc.arg(external_calendar_id)
ORDER BY external_event_id;

-- name: ListCutoverEventLinks :many
-- 切り替えの取り込みで作った予定の対応を返す。
SELECT * FROM external_event_links WHERE cutover_id = sqlc.arg(cutover_id) ORDER BY id;

-- name: DeleteExternalEventLinksByID :many
-- 予定の対応を消し、対応していた予定と繰り返しの予定を返す。
DELETE FROM external_event_links WHERE id = ANY(sqlc.arg(ids)::text[])
RETURNING schedule_id, recurring_schedule_id;

-- name: DeleteImportedSchedules :many
-- 取り込みで作った単発の予定と、消す繰り返しの予定の回を置き換えた予定を消し、訪問の情報を返す。
-- キャンセルと書き出しの待ちは、外部キーで一緒に消える。
DELETE FROM schedules
WHERE id = ANY(sqlc.arg(ids)::text[]) OR recurring_schedule_id = ANY(sqlc.arg(recurring_schedule_ids)::text[])
RETURNING visit_info_id;

-- name: DeleteImportedRecurringSchedules :many
-- 取り込みで作った繰り返しの予定を消し、訪問の情報を返す。除外する日と書き出しの待ちは、外部キーで一緒に消える。
DELETE FROM recurring_schedules WHERE id = ANY(sqlc.arg(ids)::text[])
RETURNING visit_info_id;

-- name: DeleteImportedVisitInfos :exec
-- 消した予定の訪問の情報を消す。
DELETE FROM visit_infos WHERE id = ANY(sqlc.arg(ids)::text[]);
