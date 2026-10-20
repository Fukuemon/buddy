-- name: GetScheduleType :one
SELECT * FROM schedule_types WHERE id = ?;

-- name: ListScheduleTypes :many
SELECT * FROM schedule_types ORDER BY name, id;

-- name: CreateSchedule :exec
INSERT INTO schedules (
    id, facility_id, staff_id, schedule_type_id, date, start_time, end_time,
    recurring_schedule_id, visit_info_id, title, description, is_over_time_work
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);

-- name: GetScheduleDetail :one
SELECT * FROM schedule_details WHERE id = ?;

-- name: ListScheduleDetailsByFacility :many
SELECT * FROM schedule_details
WHERE facility_id = sqlc.arg(facility_id)
  AND (sqlc.narg(schedule_type) IS NULL OR schedule_type_name = sqlc.narg(schedule_type))
  AND (sqlc.narg(date_from) IS NULL OR date >= sqlc.narg(date_from))
  AND (sqlc.narg(date_to) IS NULL OR date <= sqlc.narg(date_to))
ORDER BY
  CASE WHEN sqlc.arg(sort) = 'date_asc' THEN date END ASC,
  CASE WHEN sqlc.arg(sort) = 'date_asc' THEN start_time END ASC,
  CASE WHEN sqlc.arg(sort) = 'date_desc' THEN date END DESC,
  CASE WHEN sqlc.arg(sort) = 'date_desc' THEN start_time END DESC,
  CASE WHEN sqlc.arg(sort) = 'start_time_asc' THEN start_time END ASC,
  CASE WHEN sqlc.arg(sort) = 'start_time_desc' THEN start_time END DESC,
  CASE WHEN sqlc.arg(sort) = 'created_at_asc' THEN created_at END ASC,
  CASE WHEN sqlc.arg(sort) = 'created_at_desc' THEN created_at END DESC,
  id;

-- name: CreateRecurringRule :exec
INSERT INTO recurring_rules (id, frequency, day_of_week, day_of_month, week_of_month, end_date)
VALUES (?, ?, ?, ?, ?, ?);

-- name: CreateRecurringSchedule :exec
INSERT INTO recurring_schedules (
    id, facility_id, staff_id, schedule_type_id, recurring_rule_id, date, start_time, end_time,
    visit_info_id, title, description, is_over_time_work
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);

-- name: GetRecurringScheduleDetail :one
SELECT * FROM recurring_schedule_details WHERE id = ?;

-- name: ListRecurringScheduleDetailsByFacility :many
SELECT * FROM recurring_schedule_details
WHERE facility_id = sqlc.arg(facility_id)
  AND (sqlc.narg(schedule_type) IS NULL OR schedule_type_name = sqlc.narg(schedule_type))
ORDER BY
  CASE WHEN sqlc.arg(sort) = 'date_asc' THEN date END ASC,
  CASE WHEN sqlc.arg(sort) = 'date_asc' THEN start_time END ASC,
  CASE WHEN sqlc.arg(sort) = 'date_desc' THEN date END DESC,
  CASE WHEN sqlc.arg(sort) = 'date_desc' THEN start_time END DESC,
  CASE WHEN sqlc.arg(sort) = 'start_time_asc' THEN start_time END ASC,
  CASE WHEN sqlc.arg(sort) = 'start_time_desc' THEN start_time END DESC,
  CASE WHEN sqlc.arg(sort) = 'created_at_asc' THEN created_at END ASC,
  CASE WHEN sqlc.arg(sort) = 'created_at_desc' THEN created_at END DESC,
  id;

-- name: AddRecurringScheduleExclusion :exec
INSERT INTO recurring_schedule_exclusions (recurring_schedule_id, date) VALUES (?, ?);

-- name: ListRecurringScheduleExclusions :many
SELECT recurring_schedule_id, date
FROM recurring_schedule_exclusions
WHERE recurring_schedule_id IN (sqlc.slice('recurring_schedule_ids'))
ORDER BY date;

-- name: CreateScheduleCancel :exec
INSERT INTO schedule_cancels (id, schedule_id, reason) VALUES (?, ?, ?);

-- name: UpdateSchedule :exec
UPDATE schedules
SET staff_id = ?, schedule_type_id = ?, date = ?, start_time = ?, end_time = ?,
    visit_info_id = ?, title = ?, description = ?, is_over_time_work = ?
WHERE id = ?;

-- name: LockSchedule :one
SELECT id FROM schedules WHERE id = ? FOR UPDATE;
