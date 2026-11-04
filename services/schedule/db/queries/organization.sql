-- name: GetFacility :one
SELECT * FROM facilities WHERE id = $1;

-- name: GetFacilityByOrgID :one
SELECT * FROM facilities WHERE org_id = $1;

-- name: LockFacility :one
-- 事業所の職員の休職、退職、役職とチームを変える操作、権限を外す操作を 1 つずつにする。職員の管理の権限を持つ有効な職員を数えてから書くまでの間に、ほかの操作が割り込まない。
-- 予定と担当の新しい割り振り（ShareFacility）とも 1 つずつにし、退職の残る予定の確認と予定の作成が行き違わない。
SELECT id FROM facilities WHERE id = $1 FOR UPDATE;

-- name: ShareFacility :one
-- 予定と担当の新しい割り振りが、職員の状態を確認してから書き終えるまでの間、LockFacility を待たせる。
-- 割り振りどうしは待たせない。
SELECT id FROM facilities WHERE id = $1 FOR SHARE;

-- name: GetFacilityForShare :one
-- ShareFacility と同じ共有のロックを取り、事業所の行を返す。予定を書く操作が、ロックの中で正本のモードを読む。
SELECT * FROM facilities WHERE id = $1 FOR SHARE;

-- name: GetDepartment :one
SELECT * FROM departments WHERE id = $1;

-- name: ListDepartmentsByFacility :many
SELECT * FROM departments WHERE facility_id = $1 ORDER BY name, id;

-- name: CreateDepartment :exec
INSERT INTO departments (id, facility_id, name) VALUES ($1, $2, $3);

-- name: UpdateDepartment :execrows
UPDATE departments SET name = $2, updated_at = now() WHERE id = $1;

-- name: GetTeam :one
SELECT * FROM teams WHERE id = $1;

-- name: ListTeamsByFacility :many
SELECT * FROM teams WHERE facility_id = $1 ORDER BY name, id;

-- name: CreateTeam :exec
INSERT INTO teams (id, facility_id, name, color) VALUES ($1, $2, $3, $4);

-- name: UpdateTeam :execrows
UPDATE teams SET name = $2, color = $3, updated_at = now() WHERE id = $1;

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

-- name: GetDepartmentFacilityID :one
-- access がパスの ID のリソースの事業所を確認するときに、事業所だけを読む。
SELECT facility_id FROM departments WHERE id = $1;

-- name: GetTeamFacilityID :one
-- access がパスの ID のリソースの事業所を確認するときに、事業所だけを読む。
SELECT facility_id FROM teams WHERE id = $1;

-- name: GetPositionFacilityID :one
-- access がパスの ID のリソースの事業所を確認するときに、事業所だけを読む。
SELECT facility_id FROM positions WHERE id = $1;
