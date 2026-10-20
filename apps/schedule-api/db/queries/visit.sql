-- name: CreateVisitInfo :exec
INSERT INTO visit_infos (id, patient_id, assigned_staff_id, companion_id, service_code_id)
VALUES (?, ?, ?, ?, ?);

-- name: AddVisitInfoCategory :exec
INSERT INTO visit_info_visit_categories (visit_info_id, visit_category_id) VALUES (?, ?);

-- name: ListVisitInfoCategories :many
SELECT vivc.visit_info_id, vc.id, vc.name
FROM visit_info_visit_categories vivc
JOIN visit_categories vc ON vc.id = vivc.visit_category_id
WHERE vivc.visit_info_id IN (sqlc.slice('visit_info_ids'))
ORDER BY vc.name, vc.id;

-- name: GetServiceCode :one
SELECT * FROM service_codes WHERE id = ?;

-- name: ListServiceCodes :many
SELECT * FROM service_codes ORDER BY code, id;

-- name: ListVisitCategories :many
SELECT * FROM visit_categories ORDER BY name, id;

-- name: ListVisitCategoriesByIDs :many
SELECT * FROM visit_categories WHERE id IN (sqlc.slice('ids')) ORDER BY name, id;
