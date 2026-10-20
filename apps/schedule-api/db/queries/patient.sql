-- name: CreatePatient :exec
INSERT INTO patients (id, facility_id, name, preferred_time, preferred_gender, service_code_id, assigned_staff_id)
VALUES (?, ?, ?, ?, ?, ?, ?);

-- name: GetPatient :one
SELECT pa.id, pa.facility_id, pa.name, pa.preferred_time, pa.preferred_gender,
       pa.service_code_id, sc.code AS service_code,
       pa.assigned_staff_id, u.username AS assigned_staff_name,
       pa.created_at, pa.updated_at
FROM patients pa
JOIN service_codes sc ON sc.id = pa.service_code_id
JOIN users u ON u.id = pa.assigned_staff_id
WHERE pa.id = ?;

-- name: ListPatientsByFacility :many
SELECT pa.id, pa.facility_id, pa.name, pa.preferred_time, pa.preferred_gender,
       pa.service_code_id, sc.code AS service_code,
       pa.assigned_staff_id, u.username AS assigned_staff_name,
       pa.created_at, pa.updated_at
FROM patients pa
JOIN service_codes sc ON sc.id = pa.service_code_id
JOIN users u ON u.id = pa.assigned_staff_id
WHERE pa.facility_id = sqlc.arg(facility_id)
  AND (sqlc.narg(name) IS NULL OR pa.name = sqlc.narg(name))
  AND (sqlc.narg(preferred_time) IS NULL OR pa.preferred_time = sqlc.narg(preferred_time))
  AND (sqlc.narg(preferred_gender) IS NULL OR pa.preferred_gender = sqlc.narg(preferred_gender))
  AND (sqlc.narg(assigned_staff) IS NULL OR u.username = sqlc.narg(assigned_staff))
ORDER BY
  CASE WHEN sqlc.arg(sort) = 'name_asc' THEN pa.name END ASC,
  CASE WHEN sqlc.arg(sort) = 'name_desc' THEN pa.name END DESC,
  CASE WHEN sqlc.arg(sort) = 'created_at_asc' THEN pa.created_at END ASC,
  CASE WHEN sqlc.arg(sort) = 'created_at_desc' THEN pa.created_at END DESC,
  pa.id;
