-- name: PutCalendarEventProjection :exec
-- 同じカレンダーと Google の予定の ID の行があれば書き直す。同期を何度流しても、1 つの予定は 1 行になる。
INSERT INTO calendar_event_projections (
    external_calendar_id, external_event_id, facility_id, staff_id, recurring_event_id, original_start_at, original_start_date,
    status, title, start_at, start_date, end_at, end_date, time_zone, recurrence, etag, google_updated_at, last_end_date
) VALUES (
    sqlc.arg(external_calendar_id), sqlc.arg(external_event_id), sqlc.arg(facility_id), sqlc.arg(staff_id),
    sqlc.narg(recurring_event_id), sqlc.narg(original_start_at), sqlc.narg(original_start_date),
    sqlc.arg(status), sqlc.arg(title), sqlc.narg(start_at), sqlc.narg(start_date), sqlc.narg(end_at), sqlc.narg(end_date),
    sqlc.narg(time_zone), sqlc.arg(recurrence)::text[], sqlc.arg(etag), sqlc.narg(google_updated_at), sqlc.narg(last_end_date)
)
ON CONFLICT (external_calendar_id, external_event_id) DO UPDATE SET
    facility_id = EXCLUDED.facility_id, staff_id = EXCLUDED.staff_id, recurring_event_id = EXCLUDED.recurring_event_id,
    original_start_at = EXCLUDED.original_start_at, original_start_date = EXCLUDED.original_start_date,
    status = EXCLUDED.status, title = EXCLUDED.title, start_at = EXCLUDED.start_at, start_date = EXCLUDED.start_date,
    end_at = EXCLUDED.end_at, end_date = EXCLUDED.end_date, time_zone = EXCLUDED.time_zone, recurrence = EXCLUDED.recurrence,
    etag = EXCLUDED.etag, google_updated_at = EXCLUDED.google_updated_at, last_end_date = EXCLUDED.last_end_date,
    projected_at = now();

-- name: DeleteCalendarEventProjection :exec
-- 予定の行と、その予定を親にする例外の回の行を消す。
DELETE FROM calendar_event_projections
WHERE external_calendar_id = sqlc.arg(external_calendar_id)
  AND (external_event_id = sqlc.arg(external_event_id) OR recurring_event_id = sqlc.arg(external_event_id));

-- name: DeleteCalendarEventProjectionsExcept :exec
-- カレンダーの行のうち、Google の予定の ID が external_event_ids に無い行を消す。全件を読み直した後に、読み直しに無かった行を消す。
DELETE FROM calendar_event_projections
WHERE external_calendar_id = sqlc.arg(external_calendar_id) AND NOT (external_event_id = ANY(sqlc.arg(external_event_ids)::text[]));

-- name: DeleteCalendarEventProjectionsEndedBefore :exec
-- カレンダーの行のうち、終わる日が before より前の行を消す。終わる日の無い行（終わりの無い繰り返し）は残す。
DELETE FROM calendar_event_projections
WHERE external_calendar_id = sqlc.arg(external_calendar_id) AND last_end_date < sqlc.arg(before)::date;


-- name: ListCalendarEventProjectionsByFacility :many
-- 予定の表示の読み出し（scheduleview）が、事業所の外していないカレンダーの行のうち、終わる日が from_date より前でない行（終わる日の無い行を含む）を、
-- 職員の名前を付けて読む。外したカレンダー（退職した職員のカレンダーを含む）の行は返さない。
SELECT p.external_calendar_id, p.external_event_id, p.facility_id, p.staff_id, p.recurring_event_id, p.original_start_at, p.original_start_date,
       p.status, p.title, p.start_at, p.start_date, p.end_at, p.end_date, p.time_zone, p.recurrence, p.etag, p.google_updated_at,
       p.last_end_date, p.projected_at, u.username AS staff_name
FROM calendar_event_projections p
JOIN external_calendars c ON c.id = p.external_calendar_id AND c.facility_id = p.facility_id
JOIN users u ON u.id = p.staff_id AND u.facility_id = p.facility_id
WHERE p.facility_id = sqlc.arg(facility_id) AND c.disabled_at IS NULL
  AND (p.last_end_date IS NULL OR p.last_end_date >= sqlc.arg(from_date)::date)
ORDER BY p.external_calendar_id, p.external_event_id;

-- name: ListCalendarSyncStatusesByFacility :many
-- 事業所の外していないカレンダーの同期の状況を、職員の名前を付けて返す。同期の状態の行が無いカレンダーは never にする。
-- last_synced_at は、変わった予定を最後まで読んで当てた最後の同期の時刻である。
SELECT c.id AS external_calendar_id, c.staff_id, u.username AS staff_name,
       COALESCE(s.last_status, 'never')::text AS last_status, s.last_synced_at, s.last_error
FROM external_calendars c
JOIN users u ON u.id = c.staff_id AND u.facility_id = c.facility_id
LEFT JOIN calendar_sync_states s ON s.external_calendar_id = c.id
WHERE c.facility_id = sqlc.arg(facility_id) AND c.disabled_at IS NULL
ORDER BY c.id;

-- name: DeleteCalendarEventProjectionsByFacility :exec
-- 事業所の全ての行を消す。切り替えを完了して、事業所を buddy_primary にするときに使う。
DELETE FROM calendar_event_projections WHERE facility_id = sqlc.arg(facility_id);
