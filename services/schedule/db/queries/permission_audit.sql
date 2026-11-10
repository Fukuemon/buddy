-- name: CreatePermissionAudit :exec
-- 時刻は DB が決める。記録を消す文と書き換える文は持たない（ADR-0042）。
INSERT INTO permission_audits (id, facility_id, action, actor_kind, actor_user_id, actor_operator,
                               target_user_id, target_position_id, before, after, request_id)
VALUES (sqlc.arg(id), sqlc.arg(facility_id), sqlc.arg(action), sqlc.arg(actor_kind), sqlc.narg(actor_user_id), sqlc.narg(actor_operator),
        sqlc.narg(target_user_id), sqlc.narg(target_position_id), sqlc.narg(before), sqlc.narg(after), sqlc.arg(request_id));
