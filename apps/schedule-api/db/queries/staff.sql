-- name: CreateUser :exec
INSERT INTO users (id, sub, username, email, phone_number, facility_id, department_id, team_id, position_id)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);

-- name: AddUserPolicy :exec
INSERT INTO user_policies (id, user_id, policy_id) VALUES (?, ?, ?);

-- name: AddUserPolicyTarget :exec
INSERT INTO user_policy_targets (id, user_policy_id, target_user_id, target_team_id) VALUES (?, ?, ?, ?);

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
WHERE u.id = ?;

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
  AND (sqlc.narg(username) IS NULL OR u.username = sqlc.narg(username))
  AND (sqlc.narg(position) IS NULL OR p.name = sqlc.narg(position))
  AND (sqlc.narg(department) IS NULL OR d.name = sqlc.narg(department))
  AND (sqlc.narg(team) IS NULL OR t.name = sqlc.narg(team))
ORDER BY
  CASE WHEN sqlc.arg(sort) = 'username_asc' THEN u.username END ASC,
  CASE WHEN sqlc.arg(sort) = 'username_desc' THEN u.username END DESC,
  CASE WHEN sqlc.arg(sort) = 'created_at_asc' THEN u.created_at END ASC,
  CASE WHEN sqlc.arg(sort) = 'created_at_desc' THEN u.created_at END DESC,
  CASE WHEN sqlc.arg(sort) = 'updated_at_asc' THEN u.updated_at END ASC,
  CASE WHEN sqlc.arg(sort) = 'updated_at_desc' THEN u.updated_at END DESC,
  u.id;

-- name: ListUserPolicies :many
SELECT up.id AS user_policy_id, up.user_id, p.id AS policy_id, p.code AS policy_code, p.name AS policy_name
FROM user_policies up
JOIN policies p ON p.id = up.policy_id
WHERE up.user_id IN (sqlc.slice('user_ids'))
ORDER BY p.name, p.id;

-- name: ListUserPolicyTargets :many
SELECT upt.user_policy_id, upt.target_user_id, upt.target_team_id
FROM user_policy_targets upt
JOIN user_policies up ON up.id = upt.user_policy_id
WHERE up.user_id = ?
ORDER BY upt.target_user_id, upt.target_team_id;

-- name: GetUserIDBySub :one
SELECT id FROM users WHERE sub = ?;

-- name: LinkUserSub :exec
-- 条件の sub IS NULL で、同時に来た初回のログインのうち 1 つだけが書く。
UPDATE users SET sub = sqlc.arg(sub)
WHERE facility_id = sqlc.arg(facility_id) AND email = sqlc.arg(email) AND sub IS NULL;
