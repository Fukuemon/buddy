-- name: GetFacility :one
SELECT * FROM facilities WHERE id = $1;

-- name: GetFacilityByOrgID :one
SELECT * FROM facilities WHERE org_id = $1;

-- name: GetDepartment :one
SELECT * FROM departments WHERE id = $1;

-- name: ListDepartmentsByFacility :many
SELECT * FROM departments WHERE facility_id = $1 ORDER BY name, id;

-- name: GetTeam :one
SELECT * FROM teams WHERE id = $1;

-- name: ListTeamsByFacility :many
SELECT * FROM teams WHERE facility_id = $1 ORDER BY name, id;

-- name: CreateTeam :exec
INSERT INTO teams (id, facility_id, name) VALUES ($1, $2, $3);

-- name: GetPosition :one
SELECT * FROM positions WHERE id = $1;

-- name: ListPositionsByFacility :many
SELECT * FROM positions WHERE facility_id = $1 ORDER BY name, id;

-- name: CreatePosition :exec
INSERT INTO positions (id, facility_id, name) VALUES ($1, $2, $3);

-- name: AddPositionPolicy :exec
INSERT INTO position_policies (position_id, policy_id) VALUES ($1, $2);

-- name: ListPoliciesByPositions :many
SELECT pp.position_id, p.id, p.code, p.name, p.needs_target, p.created_at, p.updated_at
FROM position_policies pp
JOIN policies p ON p.id = pp.policy_id
WHERE pp.position_id = ANY (sqlc.arg(position_ids)::text[])
ORDER BY p.name, p.id;

-- name: GetPolicy :one
SELECT * FROM policies WHERE id = $1;

-- name: ListPolicies :many
SELECT * FROM policies ORDER BY name, id;

-- name: ListPoliciesByIDs :many
SELECT * FROM policies WHERE id = ANY (sqlc.arg(ids)::text[]) ORDER BY name, id;
