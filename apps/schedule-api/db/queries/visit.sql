-- name: CreateVisitInfo :exec
INSERT INTO visit_infos (id, facility_id, patient_id, assigned_staff_id, companion_id, service_code_id)
VALUES ($1, $2, $3, $4, $5, $6);

-- name: AddVisitInfoCategory :exec
INSERT INTO visit_info_visit_categories (visit_info_id, visit_category_id) VALUES ($1, $2);

-- name: ListVisitInfoCategories :many
SELECT vivc.visit_info_id, vc.id, vc.name
FROM visit_info_visit_categories vivc
JOIN visit_categories vc ON vc.id = vivc.visit_category_id
WHERE vivc.visit_info_id = ANY (sqlc.arg(visit_info_ids)::text[])
ORDER BY vc.name, vc.id;

-- name: GetServiceCode :one
SELECT * FROM service_codes WHERE id = $1;

-- name: ListServiceCodes :many
SELECT * FROM service_codes ORDER BY code, id;

-- name: ListVisitCategories :many
SELECT * FROM visit_categories ORDER BY name, id;

-- name: ListVisitCategoriesByIDs :many
SELECT * FROM visit_categories WHERE id = ANY (sqlc.arg(ids)::text[]) ORDER BY name, id;

-- name: DeleteUnusedVisitInfo :exec
-- visit_info_visit_categories は外部キーの ON DELETE CASCADE で消える。
DELETE FROM visit_infos vi
WHERE vi.id = $1
  AND NOT EXISTS (SELECT 1 FROM schedules s WHERE s.visit_info_id = vi.id)
  AND NOT EXISTS (SELECT 1 FROM recurring_schedules rs WHERE rs.visit_info_id = vi.id);
