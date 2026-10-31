-- name: CreateUser :exec
INSERT INTO users (id, sub, username, email, phone_number, facility_id, department_id, team_id, position_id)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);

-- name: AddUserPolicy :execrows
-- 事業所は職員のレコードからコピーする。職員が無ければ書かない。
INSERT INTO user_policies (id, facility_id, user_id, policy_id)
SELECT sqlc.arg(id), u.facility_id, u.id, sqlc.arg(policy_id)
FROM users u
WHERE u.id = sqlc.arg(user_id);

-- name: UpdateUserPosition :exec
UPDATE users SET position_id = sqlc.arg(position_id) WHERE id = sqlc.arg(id);

-- name: UpdateUserProfile :execrows
-- 退職した職員は書かない。メールはブローカーが持つので変えない。
UPDATE users
SET username = sqlc.arg(username), phone_number = sqlc.narg(phone_number),
    department_id = sqlc.arg(department_id), team_id = sqlc.arg(team_id)
WHERE id = sqlc.arg(id) AND retired_at IS NULL;

-- name: DeleteUserTeamTargetsCovered :exec
-- 職員の権限のうち、古いチームと新しいチームの両方を対象にするものから、古いチームの対象を消す。
-- 次の MoveUserTeamTargets が、同じ権限に同じチームの対象を 2 つ作らないためである。
DELETE FROM user_policy_targets upt
USING user_policies up
WHERE up.id = upt.user_policy_id AND up.user_id = sqlc.arg(user_id)
  AND upt.target_team_id = sqlc.arg(old_team_id)
  AND EXISTS (
    SELECT 1 FROM user_policy_targets n
    WHERE n.user_policy_id = upt.user_policy_id AND n.target_team_id = sqlc.arg(new_team_id)
  );

-- name: MoveUserTeamTargets :exec
-- 職員の権限のうち、古いチームを指す対象を新しいチームに移す。ほかのチームの対象は残す。
UPDATE user_policy_targets upt
SET target_team_id = sqlc.arg(new_team_id)
FROM user_policies up
WHERE up.id = upt.user_policy_id AND up.user_id = sqlc.arg(user_id)
  AND upt.target_team_id = sqlc.arg(old_team_id);

-- name: DeleteUserPolicies :exec
-- user_policy_targets は外部キーの ON DELETE CASCADE で消える。
DELETE FROM user_policies WHERE user_id = $1;

-- name: DeleteUserPolicy :execrows
-- user_policy_targets は外部キーの ON DELETE CASCADE で消える。
DELETE FROM user_policies WHERE id = sqlc.arg(id) AND user_id = sqlc.arg(user_id);

-- name: AddUserPolicyTarget :execrows
-- 事業所は職員の権限のレコードからコピーする。職員の権限が無ければ書かない。
INSERT INTO user_policy_targets (id, facility_id, user_policy_id, target_user_id, target_team_id)
SELECT sqlc.arg(id), up.facility_id, up.id, sqlc.narg(target_user_id), sqlc.narg(target_team_id)
FROM user_policies up
WHERE up.id = sqlc.arg(user_policy_id);

-- name: GetUser :one
SELECT u.id, u.sub, u.username, u.email, u.phone_number, u.facility_id,
       u.department_id, d.name AS department_name,
       u.team_id, t.name AS team_name,
       u.position_id, p.name AS position_name,
       u.leave_started_at, u.leave_return_date, u.retired_at, u.created_at, u.updated_at
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
       u.leave_started_at, u.leave_return_date, u.retired_at, u.created_at, u.updated_at
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

-- name: StartUserLeave :execrows
-- 休職の職員を休職にし直しても、最初に休職にした時刻を残し、戻る予定の日だけを書き換える。退職した職員は書かない。
UPDATE users
SET leave_started_at = coalesce(leave_started_at, now()), leave_return_date = sqlc.narg(return_date)
WHERE id = sqlc.arg(id) AND retired_at IS NULL;

-- name: EndUserLeave :execrows
-- 退職した職員は書かない。
UPDATE users SET leave_started_at = NULL, leave_return_date = NULL WHERE id = $1 AND retired_at IS NULL;

-- name: RetireUser :execrows
-- 退職した職員を退職にし直しても、最初に退職にした時刻を残す。名前、所属、役職は残し、メールと電話番号を消す。
UPDATE users
SET retired_at = coalesce(retired_at, now()), leave_started_at = NULL, leave_return_date = NULL,
    email = NULL, phone_number = NULL
WHERE id = $1;

-- name: LockFacility :one
-- 事業所の職員の休職、退職、役職とチームを変える操作、権限を外す操作を 1 つずつにする。職員の管理の権限を持つ有効な職員を数えてから書くまでの間に、ほかの操作が割り込まない。
-- 予定と担当の新しい割り振り（ShareFacility）とも 1 つずつにし、退職の残る予定の確認と予定の作成が行き違わない。
SELECT id FROM facilities WHERE id = $1 FOR UPDATE;

-- name: ListActiveStaffManagers :many
-- 事業所で職員の管理の権限を持つ、休職でも退職でもない職員の ID を返す。
SELECT DISTINCT u.id
FROM users u
JOIN user_policies up ON up.user_id = u.id
JOIN policies p ON p.id = up.policy_id
WHERE u.facility_id = $1 AND p.code = 'staff.manage' AND u.leave_started_at IS NULL AND u.retired_at IS NULL
ORDER BY u.id;

-- name: ListStaffSchedulesFrom :many
-- 職員が予定の職員、主訪問者、同行者のどれかの、from 以降のキャンセルしていない単発の予定を返す。
SELECT s.id, s.date, s.start_time, s.end_time
FROM schedules s
LEFT JOIN visit_infos v ON v.id = s.visit_info_id
WHERE s.facility_id = sqlc.arg(facility_id)
  AND (s.staff_id = sqlc.arg(staff_id) OR v.assigned_staff_id = sqlc.arg(staff_id) OR v.companion_id = sqlc.arg(staff_id))
  AND s.date >= sqlc.arg(from_date)
  AND NOT EXISTS (SELECT 1 FROM schedule_cancels c WHERE c.schedule_id = s.id)
ORDER BY s.date, s.start_time, s.id;

-- name: ListStaffRecurringSchedulesFrom :many
-- 職員が予定の職員、主訪問者、同行者のどれかの、from 以降に終わる繰り返しの予定を返す。終了日の無い繰り返しは含める。
SELECT r.id, r.date, r.end_date, r.start_time, r.end_time
FROM recurring_schedules r
LEFT JOIN visit_infos v ON v.id = r.visit_info_id
WHERE r.facility_id = sqlc.arg(facility_id)
  AND (r.staff_id = sqlc.arg(staff_id) OR v.assigned_staff_id = sqlc.arg(staff_id) OR v.companion_id = sqlc.arg(staff_id))
  AND (r.end_date IS NULL OR r.end_date >= sqlc.arg(from_date)::date)
ORDER BY r.date, r.start_time, r.id;

-- name: ListStaffAssignedPatients :many
-- 利用の終了の利用者は、担当に数えない（ADR-0021）。
SELECT id, name FROM patients WHERE facility_id = $1 AND assigned_staff_id = $2 AND ended_at IS NULL ORDER BY name, id;

-- name: GetUserRef :one
-- ほかの機能が職員を参照するときに要るカラムだけを読む。
SELECT id, facility_id, team_id, leave_started_at, retired_at FROM users WHERE id = $1;

-- name: ListUserRefsByFacility :many
SELECT id, facility_id, team_id, leave_started_at, retired_at FROM users WHERE facility_id = $1 ORDER BY id;

-- name: ShareFacility :one
-- 予定と担当の新しい割り振りが、職員の状態を確認してから書き終えるまでの間、LockFacility を待たせる。
-- 割り振りどうしは待たせない。
SELECT id FROM facilities WHERE id = $1 FOR SHARE;
