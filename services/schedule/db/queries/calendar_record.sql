-- name: GetCalendarEventRecordForUpdate :one
SELECT * FROM calendar_event_records WHERE schedule_id = $1 FOR UPDATE;

-- name: CreateCalendarEventRecord :exec
INSERT INTO calendar_event_records (
    schedule_id, facility_id, external_calendar_id, external_event_id, visit_info_id, version,
    pending_version, pending_state, pending_visit_info_id, pending_deadline
) VALUES (
    sqlc.arg(schedule_id), sqlc.arg(facility_id), sqlc.arg(external_calendar_id), sqlc.arg(external_event_id),
    sqlc.narg(visit_info_id), sqlc.arg(version), sqlc.narg(pending_version), sqlc.narg(pending_state),
    sqlc.narg(pending_visit_info_id), sqlc.narg(pending_deadline)
);

-- name: UpdateCalendarEventRecord :exec
UPDATE calendar_event_records
SET visit_info_id = sqlc.narg(visit_info_id), version = sqlc.arg(version),
    pending_version = sqlc.narg(pending_version), pending_state = sqlc.narg(pending_state),
    pending_visit_info_id = sqlc.narg(pending_visit_info_id), pending_deadline = sqlc.narg(pending_deadline)
WHERE schedule_id = sqlc.arg(schedule_id);

-- name: DeleteCalendarEventRecord :exec
DELETE FROM calendar_event_records WHERE schedule_id = $1;
