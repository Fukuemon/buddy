-- name: EnsureCalendarSyncStates :exec
-- 外していないカレンダーのうち、同期の状態の行が無いものに行を足す。
INSERT INTO calendar_sync_states (external_calendar_id, facility_id, last_status)
SELECT c.id, c.facility_id, 'never' FROM external_calendars c
WHERE c.disabled_at IS NULL
ON CONFLICT (external_calendar_id) DO NOTHING;

-- name: ClaimCalendarSyncs :many
-- 複数の処理が同時に取っても同じカレンダーを渡さないよう、行をロックできたものだけを取る。外したカレンダーは取らない。
-- 事業所の正本のモードが modes に無いカレンダーは取らない（ADR-0008）。
UPDATE calendar_sync_states s
SET locked_until = now() + make_interval(secs => sqlc.arg(lease_seconds)::float8)
FROM external_calendars c
WHERE c.id = s.external_calendar_id AND s.external_calendar_id IN (
    SELECT s2.external_calendar_id FROM calendar_sync_states s2
    JOIN external_calendars c2 ON c2.id = s2.external_calendar_id
    JOIN facilities f ON f.id = c2.facility_id
    WHERE c2.disabled_at IS NULL AND f.source_mode = ANY(sqlc.arg(modes)::text[]) AND s2.next_sync_at <= now() AND (s2.locked_until IS NULL OR s2.locked_until <= now())
    ORDER BY s2.next_sync_at, s2.external_calendar_id
    LIMIT sqlc.arg(max_count)
    FOR UPDATE OF s2 SKIP LOCKED
)
RETURNING s.external_calendar_id AS id, s.sync_token, s.last_status, s.last_error, s.locked_until,
          c.facility_id, c.staff_id, c.provider, c.external_calendar_id AS calendar_id;

-- name: FinishCalendarSync :execrows
-- 取ったときの locked_until と比べ、lease が切れた後にほかの処理が取り直したカレンダーを変えない。
UPDATE calendar_sync_states
SET sync_token = sqlc.narg(sync_token), last_status = sqlc.arg(last_status), last_error = sqlc.narg(last_error),
    last_synced_at = CASE WHEN sqlc.arg(synced)::bool THEN now() ELSE last_synced_at END,
    next_sync_at = now() + make_interval(secs => sqlc.arg(after_seconds)::float8), locked_until = NULL
WHERE external_calendar_id = sqlc.arg(external_calendar_id) AND locked_until = sqlc.arg(locked_until);

-- name: GetExternalEventLinkByEvent :one
SELECT * FROM external_event_links WHERE external_calendar_id = $1 AND external_event_id = $2;

-- name: CalendarSyncBacklog :one
-- 外していないカレンダーのうち、事業所の正本のモードが modes にあるカレンダーの、読む時刻を過ぎたものの数と、
-- 最も古い最後の成功からの秒数を返す。
-- 1 回も成功していないカレンダーは、同期の状態の行を足した時刻から数える。カレンダーが無ければ秒数は 0 である。
SELECT count(*) FILTER (WHERE s.next_sync_at <= now())::int AS overdue_count,
       COALESCE(EXTRACT(EPOCH FROM now() - min(COALESCE(s.last_synced_at, s.created_at))), 0)::float8 AS oldest_success_age_seconds
FROM calendar_sync_states s
JOIN external_calendars c ON c.id = s.external_calendar_id
JOIN facilities f ON f.id = c.facility_id
WHERE c.disabled_at IS NULL AND f.source_mode = ANY(sqlc.arg(modes)::text[]);
