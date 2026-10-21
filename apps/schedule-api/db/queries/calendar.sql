-- name: GetExternalCalendar :one
SELECT * FROM external_calendars WHERE id = $1;

-- name: LockExternalCalendar :one
SELECT id FROM external_calendars WHERE id = $1 FOR UPDATE;

-- name: FindExternalCalendar :one
SELECT * FROM external_calendars WHERE provider = $1 AND external_calendar_id = $2;

-- name: ListExternalCalendarsByFacility :many
SELECT * FROM external_calendars WHERE facility_id = $1 AND disabled_at IS NULL ORDER BY created_at, id;

-- name: ListLatestImportRunsByFacility :many
-- カレンダーごとに、最も新しく始めた取り込みを返す。
SELECT DISTINCT ON (external_calendar_id) * FROM import_runs
WHERE facility_id = $1
ORDER BY external_calendar_id, started_at DESC, id DESC;

-- name: CreateExternalCalendar :exec
INSERT INTO external_calendars (id, facility_id, staff_id, provider, external_calendar_id)
VALUES ($1, $2, $3, $4, $5);

-- name: EnableExternalCalendar :exec
UPDATE external_calendars SET disabled_at = NULL WHERE id = $1;

-- name: DisableExternalCalendar :exec
UPDATE external_calendars SET disabled_at = now() WHERE id = $1 AND disabled_at IS NULL;

-- name: ExistsRunningImport :one
SELECT EXISTS (
    SELECT 1 FROM import_runs
    WHERE external_calendar_id = sqlc.arg(external_calendar_id) AND status = 'running' AND started_at > sqlc.arg(since)
);

-- name: CreateImportRun :exec
INSERT INTO import_runs (id, facility_id, external_calendar_id, requested_by, range_start, range_end, status)
VALUES ($1, $2, $3, $4, $5, $6, $7);

-- name: FinishImportRun :one
UPDATE import_runs
SET status = $2, imported_count = $3, skipped_count = $4, finished_at = now()
WHERE id = $1
RETURNING *;

-- name: ListExternalEventLinks :many
SELECT * FROM external_event_links WHERE external_calendar_id = $1 ORDER BY id;

-- name: CreateExternalEventLink :exec
INSERT INTO external_event_links (
    id, facility_id, external_calendar_id, external_event_id, recurring_event_id, etag, synced_version, schedule_id, recurring_schedule_id
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);

-- name: GetActiveExternalCalendarByStaff :one
SELECT * FROM external_calendars WHERE staff_id = $1 AND disabled_at IS NULL;

-- name: GetExternalEventLinkBySchedule :one
SELECT * FROM external_event_links WHERE schedule_id = $1;

-- name: GetExternalEventLinkByRecurringSchedule :one
SELECT * FROM external_event_links WHERE recurring_schedule_id = $1;

-- name: UpdateExternalEventLink :exec
UPDATE external_event_links SET etag = $2, synced_version = $3 WHERE id = $1;

-- name: DeleteExternalEventLink :exec
DELETE FROM external_event_links WHERE id = $1;
