-- name: CreatePatient :exec
INSERT INTO patients (id, facility_id, name, preferred_time, preferred_gender, service_code_id, assigned_staff_id)
VALUES ($1, $2, $3, $4, $5, $6, $7);

-- name: UpdatePatient :execrows
UPDATE patients
SET name = $2, preferred_time = $3, preferred_gender = $4, service_code_id = $5, assigned_staff_id = $6, updated_at = now()
WHERE id = $1;

-- name: EndPatientService :execrows
-- 利用者を利用の終了にする。利用の終了の利用者では、最初に利用の終了にした時刻を残す。
UPDATE patients
SET ended_at = COALESCE(ended_at, now()), updated_at = now()
WHERE id = $1;

-- name: ResumePatientService :execrows
-- 利用者を利用中に戻し、担当の職員を書き換える。
UPDATE patients
SET ended_at = NULL, assigned_staff_id = $2, updated_at = now()
WHERE id = $1;

-- name: GetPatient :one
SELECT pa.id, pa.facility_id, pa.name, pa.preferred_time, pa.preferred_gender,
       pa.service_code_id, sc.code AS service_code,
       pa.assigned_staff_id, u.username AS assigned_staff_name,
       pa.ended_at, pa.created_at, pa.updated_at
FROM patients pa
JOIN service_codes sc ON sc.id = pa.service_code_id
JOIN users u ON u.id = pa.assigned_staff_id
WHERE pa.id = $1;

-- name: ListPatientsByFacility :many
-- include_ended が false なら、利用の終了の利用者を除く。
SELECT pa.id, pa.facility_id, pa.name, pa.preferred_time, pa.preferred_gender,
       pa.service_code_id, sc.code AS service_code,
       pa.assigned_staff_id, u.username AS assigned_staff_name,
       pa.ended_at, pa.created_at, pa.updated_at
FROM patients pa
JOIN service_codes sc ON sc.id = pa.service_code_id
JOIN users u ON u.id = pa.assigned_staff_id
WHERE pa.facility_id = sqlc.arg(facility_id)
  AND (sqlc.arg(include_ended)::boolean OR pa.ended_at IS NULL)
  AND (sqlc.narg(name)::text IS NULL OR pa.name = sqlc.narg(name))
  AND (sqlc.narg(preferred_time)::text IS NULL OR pa.preferred_time = sqlc.narg(preferred_time))
  AND (sqlc.narg(preferred_gender)::text IS NULL OR pa.preferred_gender = sqlc.narg(preferred_gender))
  AND (sqlc.narg(assigned_staff)::text IS NULL OR u.username = sqlc.narg(assigned_staff))
ORDER BY
  CASE WHEN sqlc.arg(sort)::text = 'name_asc' THEN pa.name END ASC,
  CASE WHEN sqlc.arg(sort)::text = 'name_desc' THEN pa.name END DESC,
  CASE WHEN sqlc.arg(sort)::text = 'created_at_asc' THEN pa.created_at END ASC,
  CASE WHEN sqlc.arg(sort)::text = 'created_at_desc' THEN pa.created_at END DESC,
  pa.id;

-- name: ListPatientSchedulesFrom :many
-- 訪問の情報の利用者が patient_id の、from 以降のキャンセルしていない単発の予定を返す。
SELECT s.id, s.date, s.start_time, s.end_time
FROM schedules s
JOIN visit_infos v ON v.id = s.visit_info_id
WHERE s.facility_id = sqlc.arg(facility_id)
  AND v.patient_id = sqlc.arg(patient_id)
  AND s.date >= sqlc.arg(from_date)
  AND NOT EXISTS (SELECT 1 FROM schedule_cancels c WHERE c.schedule_id = s.id)
ORDER BY s.date, s.start_time, s.id;

-- name: ListPatientRecurringSchedulesFrom :many
-- 訪問の情報の利用者が patient_id の、from 以降に終わる繰り返しの予定を返す。終了日の無い繰り返しは含める。
SELECT r.id, r.date, r.end_date, r.start_time, r.end_time
FROM recurring_schedules r
JOIN visit_infos v ON v.id = r.visit_info_id
WHERE r.facility_id = sqlc.arg(facility_id)
  AND v.patient_id = sqlc.arg(patient_id)
  AND (r.end_date IS NULL OR r.end_date >= sqlc.arg(from_date)::date)
ORDER BY r.date, r.start_time, r.id;

-- name: GetPatientFacilityID :one
-- access がパスの ID のリソースの事業所を確認するときに、事業所だけを読む。
SELECT facility_id FROM patients WHERE id = $1;
