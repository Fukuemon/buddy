-- name: GetCalendarEventRecordForUpdate :one
SELECT * FROM calendar_event_records WHERE schedule_id = $1 FOR UPDATE;

-- name: ListCalendarEventRecordIDs :many
-- 一覧（scheduleview）が、展開した繰り返しの回の ID のうち、記録の主キーである ID を 1 回で引く。回を別の職員のカレンダーに移した後に
-- 元のカレンダーに残った回に、別の一覧の ID を付けるためである。
SELECT schedule_id FROM calendar_event_records WHERE facility_id = sqlc.arg(facility_id) AND schedule_id = ANY(sqlc.arg(schedule_ids)::text[]);

-- name: FindCalendarEventRecordAtForUpdate :one
-- 繰り返しの予定の例外の回を変える書き込みが、親の予定の記録を、親の予定の場所で引く。
SELECT * FROM calendar_event_records WHERE external_calendar_id = sqlc.arg(external_calendar_id) AND external_event_id = sqlc.arg(external_event_id) FOR UPDATE;

-- name: CreateCalendarEventRecord :exec
INSERT INTO calendar_event_records (
    schedule_id, facility_id, external_calendar_id, external_event_id, visit_info_id, version,
    pending_version, pending_state, pending_visit_info_id, pending_deadline, pending_external_calendar_id, pending_external_event_id
) VALUES (
    sqlc.arg(schedule_id), sqlc.arg(facility_id), sqlc.arg(external_calendar_id), sqlc.arg(external_event_id),
    sqlc.narg(visit_info_id), sqlc.arg(version), sqlc.narg(pending_version), sqlc.narg(pending_state),
    sqlc.narg(pending_visit_info_id), sqlc.narg(pending_deadline), sqlc.narg(pending_external_calendar_id), sqlc.narg(pending_external_event_id)
);

-- name: UpdateCalendarEventRecord :exec
UPDATE calendar_event_records
SET external_calendar_id = sqlc.arg(external_calendar_id), external_event_id = sqlc.arg(external_event_id),
    visit_info_id = sqlc.narg(visit_info_id), version = sqlc.arg(version),
    pending_version = sqlc.narg(pending_version), pending_state = sqlc.narg(pending_state),
    pending_visit_info_id = sqlc.narg(pending_visit_info_id), pending_deadline = sqlc.narg(pending_deadline),
    pending_external_calendar_id = sqlc.narg(pending_external_calendar_id), pending_external_event_id = sqlc.narg(pending_external_event_id)
WHERE schedule_id = sqlc.arg(schedule_id);

-- name: DeleteCalendarEventRecord :exec
DELETE FROM calendar_event_records WHERE schedule_id = $1;

-- name: ClaimExpiredCalendarEventRecords :many
-- 書く期限を過ぎた保留の版を持つ記録を、同期が読み戻すために取る（ADR-0026）。保留の版の状態（writing、unknown）では絞らない。
-- 複数の処理が同時に取っても同じ記録を渡さないよう、行をロックできたものだけを取り、locked_until までほかの処理に渡さない。
-- 保留の版を書く予定のカレンダー（移す書き込みでは移す先）を外した記録と、事業所の正本のモードが modes に無い記録は取らない。
-- 返すカレンダーも、保留の版を書く予定のカレンダーである。
UPDATE calendar_event_records r
SET pending_locked_until = sqlc.arg(locked_until)
FROM external_calendars c
WHERE c.id = COALESCE(r.pending_external_calendar_id, r.external_calendar_id) AND r.schedule_id IN (
    SELECT r2.schedule_id FROM calendar_event_records r2
    JOIN external_calendars c2 ON c2.id = COALESCE(r2.pending_external_calendar_id, r2.external_calendar_id)
    JOIN facilities f ON f.id = r2.facility_id
    WHERE r2.pending_version IS NOT NULL AND r2.pending_deadline <= sqlc.arg(now)
      AND (r2.pending_locked_until IS NULL OR r2.pending_locked_until <= sqlc.arg(now))
      AND c2.disabled_at IS NULL AND f.source_mode = ANY(sqlc.arg(modes)::text[])
    ORDER BY r2.pending_deadline, r2.schedule_id
    LIMIT sqlc.arg(max_count)
    FOR UPDATE OF r2 SKIP LOCKED
)
RETURNING r.schedule_id, r.facility_id, r.external_calendar_id, r.external_event_id, r.visit_info_id, r.version,
          r.pending_version, r.pending_state, r.pending_visit_info_id, r.pending_deadline, r.pending_locked_until,
          r.pending_external_calendar_id, r.pending_external_event_id,
          c.staff_id, c.provider, c.external_calendar_id AS calendar_id;

-- name: ReleaseCalendarEventRecord :exec
-- 取ったときの locked_until と比べ、ほかの処理が取り直した記録を変えない。
UPDATE calendar_event_records SET pending_locked_until = NULL
WHERE schedule_id = sqlc.arg(schedule_id) AND pending_locked_until = sqlc.arg(locked_until);
