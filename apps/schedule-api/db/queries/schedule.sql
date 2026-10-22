-- name: GetScheduleType :one
SELECT * FROM schedule_types WHERE id = $1;

-- name: ListScheduleTypes :many
SELECT * FROM schedule_types ORDER BY name, id;

-- name: CreateSchedule :exec
-- is_over_time_work は開始の時刻から生成するカラムなので書かない。
INSERT INTO schedules (
    id, facility_id, staff_id, schedule_type_id, date, start_time, end_time,
    recurring_schedule_id, original_date, visit_info_id, title, description
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12);

-- name: GetScheduleDetail :one
SELECT * FROM schedule_details WHERE id = $1;

-- name: ListScheduleDetailsByFacility :many
SELECT * FROM schedule_details
WHERE facility_id = sqlc.arg(facility_id)
  AND (sqlc.narg(schedule_type)::text IS NULL OR schedule_type_name = sqlc.narg(schedule_type))
  AND (sqlc.narg(date_from)::date IS NULL OR date >= sqlc.narg(date_from))
  AND (sqlc.narg(date_to)::date IS NULL OR date <= sqlc.narg(date_to))
ORDER BY
  CASE WHEN sqlc.arg(sort)::text = 'date_asc' THEN date END ASC,
  CASE WHEN sqlc.arg(sort)::text = 'date_asc' THEN start_time END ASC,
  CASE WHEN sqlc.arg(sort)::text = 'date_desc' THEN date END DESC,
  CASE WHEN sqlc.arg(sort)::text = 'date_desc' THEN start_time END DESC,
  CASE WHEN sqlc.arg(sort)::text = 'start_time_asc' THEN start_time END ASC,
  CASE WHEN sqlc.arg(sort)::text = 'start_time_desc' THEN start_time END DESC,
  CASE WHEN sqlc.arg(sort)::text = 'created_at_asc' THEN created_at END ASC,
  CASE WHEN sqlc.arg(sort)::text = 'created_at_desc' THEN created_at END DESC,
  id;

-- name: CreateRecurringSchedule :exec
-- is_over_time_work は開始の時刻から生成するカラムなので書かない。
INSERT INTO recurring_schedules (
    id, facility_id, staff_id, schedule_type_id, date, start_time, end_time,
    visit_info_id, title, description,
    frequency, day_of_week, day_of_month, week_of_month, end_date
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15);

-- name: GetRecurringScheduleDetail :one
SELECT * FROM recurring_schedule_details WHERE id = $1;

-- name: ListRecurringScheduleDetailsByFacility :many
SELECT * FROM recurring_schedule_details
WHERE facility_id = sqlc.arg(facility_id)
  AND (sqlc.narg(schedule_type)::text IS NULL OR schedule_type_name = sqlc.narg(schedule_type))
ORDER BY
  CASE WHEN sqlc.arg(sort)::text = 'date_asc' THEN date END ASC,
  CASE WHEN sqlc.arg(sort)::text = 'date_asc' THEN start_time END ASC,
  CASE WHEN sqlc.arg(sort)::text = 'date_desc' THEN date END DESC,
  CASE WHEN sqlc.arg(sort)::text = 'date_desc' THEN start_time END DESC,
  CASE WHEN sqlc.arg(sort)::text = 'start_time_asc' THEN start_time END ASC,
  CASE WHEN sqlc.arg(sort)::text = 'start_time_desc' THEN start_time END DESC,
  CASE WHEN sqlc.arg(sort)::text = 'created_at_asc' THEN created_at END ASC,
  CASE WHEN sqlc.arg(sort)::text = 'created_at_desc' THEN created_at END DESC,
  id;

-- name: AddRecurringScheduleExclusion :exec
INSERT INTO recurring_schedule_exclusions (recurring_schedule_id, date) VALUES ($1, $2);

-- name: ListRecurringScheduleExclusions :many
SELECT recurring_schedule_id, date
FROM recurring_schedule_exclusions
WHERE recurring_schedule_id = ANY (sqlc.arg(recurring_schedule_ids)::text[])
ORDER BY date;

-- name: CreateScheduleCancel :exec
INSERT INTO schedule_cancels (id, schedule_id, reason) VALUES ($1, $2, $3);

-- name: UpdateSchedule :exec
UPDATE schedules
SET staff_id = sqlc.arg(staff_id), schedule_type_id = sqlc.arg(schedule_type_id), date = sqlc.arg(date),
    start_time = sqlc.arg(start_time), end_time = sqlc.arg(end_time),
    visit_info_id = sqlc.narg(visit_info_id), title = sqlc.narg(title), description = sqlc.narg(description),
    version = version + 1
WHERE id = sqlc.arg(id);

-- name: BumpScheduleVersion :exec
UPDATE schedules SET version = version + 1 WHERE id = $1;

-- name: BumpRecurringScheduleVersion :exec
UPDATE recurring_schedules SET version = version + 1 WHERE id = $1;

-- name: LockSchedule :one
SELECT id FROM schedules WHERE id = $1 FOR UPDATE;
