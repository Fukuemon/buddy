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

