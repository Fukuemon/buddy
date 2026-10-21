-- name: CreateUser :exec
INSERT INTO users (id, sub, username, email, phone_number, facility_id, department_id, team_id, position_id)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);

-- name: AddUserPolicy :execrows
-- 事業所は職員の行から写す。職員が無ければ書かない。
INSERT INTO user_policies (id, facility_id, user_id, policy_id)
SELECT sqlc.arg(id), u.facility_id, u.id, sqlc.arg(policy_id)
FROM users u
WHERE u.id = sqlc.arg(user_id);

-- name: UpdateUserPosition :exec
UPDATE users SET position_id = sqlc.arg(position_id) WHERE id = sqlc.arg(id);

-- name: DeleteUserPolicies :exec
-- user_policy_targets は外部キーの ON DELETE CASCADE で消える。
DELETE FROM user_policies WHERE user_id = $1;

-- name: DeleteUserPolicy :execrows
-- user_policy_targets は外部キーの ON DELETE CASCADE で消える。
DELETE FROM user_policies WHERE id = sqlc.arg(id) AND user_id = sqlc.arg(user_id);

-- name: AddUserPolicyTarget :exec
-- 事業所は職員の権限の行から写す。
INSERT INTO user_policy_targets (id, facility_id, user_policy_id, target_user_id, target_team_id)
SELECT sqlc.arg(id), up.facility_id, up.id, sqlc.narg(target_user_id), sqlc.narg(target_team_id)
FROM user_policies up
WHERE up.id = sqlc.arg(user_policy_id);

-- name: GetUser :one
SELECT u.id, u.sub, u.username, u.email, u.phone_number, u.facility_id,
       u.department_id, d.name AS department_name,
       u.team_id, t.name AS team_name,
       u.position_id, p.name AS position_name,
       u.created_at, u.updated_at
FROM users u
JOIN departments d ON d.id = u.department_id
JOIN teams t ON t.id = u.team_id
JOIN positions p ON p.id = u.position_id
WHERE u.id = $1;

-- name: ListUsersByFacility :many
SELECT u.id, u.sub, u.username, u.email, u.phone_number, u.facility_id,
       u.department_id, d.name AS department_name,
       u.team_id, t.name AS team_name,
       u.position_id, p.name AS position_name,
       u.created_at, u.updated_at
FROM users u
JOIN departments d ON d.id = u.department_id
JOIN teams t ON t.id = u.team_id
JOIN positions p ON p.id = u.position_id
WHERE u.facility_id = sqlc.arg(facility_id)
  AND (sqlc.narg(username)::text IS NULL OR u.username = sqlc.narg(username))
  AND (sqlc.narg(position)::text IS NULL OR p.name = sqlc.narg(position))
  AND (sqlc.narg(department)::text IS NULL OR d.name = sqlc.narg(department))
  AND (sqlc.narg(team)::text IS NULL OR t.name = sqlc.narg(team))
ORDER BY
  CASE WHEN sqlc.arg(sort)::text = 'username_asc' THEN u.username END ASC,
  CASE WHEN sqlc.arg(sort)::text = 'username_desc' THEN u.username END DESC,
  CASE WHEN sqlc.arg(sort)::text = 'created_at_asc' THEN u.created_at END ASC,
  CASE WHEN sqlc.arg(sort)::text = 'created_at_desc' THEN u.created_at END DESC,
  CASE WHEN sqlc.arg(sort)::text = 'updated_at_asc' THEN u.updated_at END ASC,
  CASE WHEN sqlc.arg(sort)::text = 'updated_at_desc' THEN u.updated_at END DESC,
  u.id;

-- name: ListUserPolicies :many
SELECT up.id AS user_policy_id, up.user_id, p.id AS policy_id, p.code AS policy_code, p.name AS policy_name
FROM user_policies up
JOIN policies p ON p.id = up.policy_id
WHERE up.user_id = ANY (sqlc.arg(user_ids)::text[])
ORDER BY p.name, p.id;

-- name: ListUserPolicyTargets :many
SELECT upt.user_policy_id, upt.target_user_id, upt.target_team_id
FROM user_policy_targets upt
JOIN user_policies up ON up.id = upt.user_policy_id
WHERE up.user_id = $1
ORDER BY upt.target_user_id, upt.target_team_id;

-- name: GetUserIDBySub :one
SELECT id FROM users WHERE sub = $1;

-- name: LinkUserSub :exec
-- 条件の sub IS NULL で、同時に来た初回のログインのうち 1 つだけが書く。email は小文字にそろえて渡す。
UPDATE users SET sub = sqlc.arg(sub)
WHERE facility_id = sqlc.arg(facility_id) AND email = sqlc.arg(email) AND sub IS NULL;

-- name: GetUserRef :one
-- ほかの機能が職員を参照するときに要る列だけを読む。
SELECT id, facility_id, team_id FROM users WHERE id = $1;

-- name: ListUserRefsByFacility :many
SELECT id, facility_id, team_id FROM users WHERE facility_id = $1 ORDER BY id;
