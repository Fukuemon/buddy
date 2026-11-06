-- name: GetScheduleType :one
SELECT * FROM schedule_types WHERE id = $1;

-- name: ListScheduleTypes :many
SELECT * FROM schedule_types ORDER BY name, id;

-- name: CreateSchedule :exec
-- is_over_time_work は開始の時刻から生成するカラムなので書かない。
INSERT INTO schedules (
    id, facility_id, staff_id, schedule_type_id, date, start_time, end_time,
    recurring_schedule_id, original_date, visit_info_id, title, description, ends_next_day
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13);

-- name: GetScheduleDetail :one
SELECT * FROM schedule_details WHERE id = $1;

-- name: ListScheduleDetailsByFacility :many
SELECT * FROM schedule_details
WHERE facility_id = sqlc.arg(facility_id)
  AND (sqlc.narg(schedule_type)::text IS NULL OR schedule_type_name = sqlc.narg(schedule_type))
  AND (sqlc.narg(date_from)::date IS NULL
       OR (date >= sqlc.narg(date_from)::date - 1 AND (date >= sqlc.narg(date_from) OR ends_next_day)))
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
    frequency, day_of_week, day_of_month, week_of_month, end_date, ends_next_day
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16);

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
    start_time = sqlc.arg(start_time), end_time = sqlc.arg(end_time), ends_next_day = sqlc.arg(ends_next_day),
    visit_info_id = sqlc.narg(visit_info_id), title = sqlc.narg(title), description = sqlc.narg(description),
    version = version + 1
WHERE id = sqlc.arg(id);

-- name: BumpScheduleVersion :exec
UPDATE schedules SET version = version + 1 WHERE id = $1;

-- name: BumpRecurringScheduleVersion :exec
UPDATE recurring_schedules SET version = version + 1 WHERE id = $1;

-- name: LockSchedule :one
SELECT id FROM schedules WHERE id = $1 FOR UPDATE;

-- name: LockRecurringSchedule :one
SELECT id FROM recurring_schedules WHERE id = $1 FOR UPDATE;

-- name: GetReplacingScheduleID :one
SELECT id FROM schedules WHERE recurring_schedule_id = $1 AND original_date = $2;

-- name: GetStoredSchedule :one
-- 予定を書く前の確認に使う予定を読む。種類、職員、訪問の情報の名前は結合しない（ADR-0023）。
SELECT s.id, s.facility_id, s.staff_id, s.schedule_type_id, s.date, s.start_time, s.end_time, s.ends_next_day,
       s.is_over_time_work, s.recurring_schedule_id, s.original_date, s.visit_info_id, s.title, s.description, s.version,
       vi.patient_id, vi.assigned_staff_id, vi.companion_id, vi.service_code_id,
       EXISTS (SELECT 1 FROM schedule_cancels c WHERE c.schedule_id = s.id) AS cancelled
FROM schedules s
LEFT JOIN visit_infos vi ON vi.id = s.visit_info_id
WHERE s.id = $1;

-- name: GetStoredRecurringSchedule :one
-- 予定を書く前の確認に使う繰り返しの予定を読む。種類、職員、訪問の情報の名前は結合しない（ADR-0023）。
SELECT rs.id, rs.facility_id, rs.staff_id, rs.schedule_type_id, rs.date, rs.start_time, rs.end_time, rs.ends_next_day,
       rs.is_over_time_work, rs.visit_info_id, rs.title, rs.description,
       rs.frequency, rs.day_of_week, rs.day_of_month, rs.week_of_month, rs.end_date, rs.version,
       vi.patient_id, vi.assigned_staff_id, vi.companion_id, vi.service_code_id
FROM recurring_schedules rs
LEFT JOIN visit_infos vi ON vi.id = rs.visit_info_id
WHERE rs.id = $1;

-- name: GetScheduleFacilityID :one
-- access がパスの ID のリソースの事業所を確認するときに、事業所だけを読む。
-- google_primary の事業所の予定は、記録の予定の ID か、記録の無い Projection の予定の一覧での ID（projected_schedule_id、detached_schedule_id）でも引く。
SELECT s.facility_id FROM schedules s WHERE s.id = $1
UNION ALL
SELECT r.facility_id FROM calendar_event_records r WHERE r.schedule_id = $1
UNION ALL
SELECT p.facility_id FROM calendar_event_projections p WHERE projected_schedule_id(p.external_calendar_id, p.external_event_id) = $1
UNION ALL
SELECT p.facility_id FROM calendar_event_projections p WHERE detached_schedule_id(p.external_calendar_id, p.external_event_id) = $1
LIMIT 1;

-- name: GetRecurringScheduleFacilityID :one
-- access がパスの ID のリソースの事業所を確認するときに、事業所だけを読む。
-- google_primary の事業所の繰り返しの予定は、記録の予定の ID か、記録の無い Projection の予定の一覧での ID でも引く。
SELECT s.facility_id FROM recurring_schedules s WHERE s.id = $1
UNION ALL
SELECT r.facility_id FROM calendar_event_records r WHERE r.schedule_id = $1
UNION ALL
SELECT p.facility_id FROM calendar_event_projections p WHERE projected_schedule_id(p.external_calendar_id, p.external_event_id) = $1
UNION ALL
SELECT p.facility_id FROM calendar_event_projections p WHERE detached_schedule_id(p.external_calendar_id, p.external_event_id) = $1
LIMIT 1;
