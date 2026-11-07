-- name: PutCalendarEventProjection :exec
-- 同じカレンダーと Google の予定の ID の行があれば書き直す。同期を何度流しても、1 つの予定は 1 行になる。
-- 書き直すのは、行の Google の更新の時刻が無いか、書く予定の時刻の方が新しいときだけにする。同期と予定の API の書き込みの、
-- 後から届いた古い内容で、新しい内容を上書きしないためである（ADR-0029）。
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
    projected_at = now()
WHERE calendar_event_projections.google_updated_at IS NULL
   OR EXCLUDED.google_updated_at > calendar_event_projections.google_updated_at;

-- name: CancelCalendarEventProjectionOccurrences :exec
-- 親の予定 parent_event_id の例外の回の行を、取り消した回の行にする。親を取り消したときに、親の行が読む期間の外になっても、
-- 例外の回を予定の表示に出さないためである。元の開始と終わる日は残す。
UPDATE calendar_event_projections
SET status = 'cancelled', title = '', start_at = NULL, start_date = NULL, end_at = NULL, end_date = NULL, time_zone = NULL,
    projected_at = now()
WHERE external_calendar_id = sqlc.arg(external_calendar_id) AND recurring_event_id = sqlc.arg(parent_event_id) AND status <> 'cancelled';

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
-- 職員の名前と、一覧での予定の ID（schedule_id）を付けて読む。外したカレンダー（退職した職員のカレンダーを含む）の行は返さない。
-- 一覧での予定の ID は、記録のある予定では記録の主キーである。記録の無い予定では projected_schedule_id で、その値がほかの予定を指す
-- 記録の主キーと同じなら（予定を移した後に前のカレンダーに残った予定）、detached_schedule_id である。
-- 繰り返しの予定の例外の回で記録の無い行は、展開した回と同じ occurrence_schedule_id である。回を変えても一覧での ID が変わらないためである。
-- その値がほかの予定を指す記録の主キーと同じなら（回を移した後に元のカレンダーに残った回）、detached_occurrence_schedule_id である。
-- 記録のある予定には、記録の確定した版の訪問の情報（visit_info_id）を、名前を付けて読む。保留の版の訪問の情報は読まない。
-- 繰り返しの予定の例外の回で、回の記録が無いか確定した版を持たないときは、親の予定の記録の訪問の情報を読む（ADR-0029）。
SELECT p.external_calendar_id, p.external_event_id, p.facility_id, p.staff_id, p.recurring_event_id, p.original_start_at, p.original_start_date,
       p.status, p.title, p.start_at, p.start_date, p.end_at, p.end_date, p.time_zone, p.recurrence, p.etag, p.google_updated_at,
       p.last_end_date, p.projected_at, u.username AS staff_name,
       COALESCE(r.schedule_id, CASE WHEN t.schedule_id IS NULL THEN COALESCE(occurrence_schedule_id(p.external_calendar_id, p.recurring_event_id, p.original_start_at, p.original_start_date), projected_schedule_id(p.external_calendar_id, p.external_event_id))
                                    ELSE COALESCE(detached_occurrence_schedule_id(p.external_calendar_id, p.recurring_event_id, p.original_start_at, p.original_start_date), detached_schedule_id(p.external_calendar_id, p.external_event_id)) END)::text AS schedule_id,
       COALESCE(r.visit_info_id, pr.visit_info_id) AS visit_info_id, vid.patient_id, vid.patient_name, vid.assigned_staff_id, vid.assigned_staff_name,
       vid.companion_id, vid.companion_name, vid.service_code_id, vid.service_code
FROM calendar_event_projections p
JOIN external_calendars c ON c.id = p.external_calendar_id AND c.facility_id = p.facility_id
JOIN users u ON u.id = p.staff_id AND u.facility_id = p.facility_id
LEFT JOIN calendar_event_records r ON r.external_calendar_id = p.external_calendar_id AND r.external_event_id = p.external_event_id
LEFT JOIN calendar_event_records t ON r.schedule_id IS NULL AND t.schedule_id = COALESCE(occurrence_schedule_id(p.external_calendar_id, p.recurring_event_id, p.original_start_at, p.original_start_date), projected_schedule_id(p.external_calendar_id, p.external_event_id))
LEFT JOIN calendar_event_records pr ON p.recurring_event_id IS NOT NULL AND (r.schedule_id IS NULL OR r.version = 0)
                                   AND pr.external_calendar_id = p.external_calendar_id AND pr.external_event_id = p.recurring_event_id
LEFT JOIN visit_info_details vid ON vid.id = COALESCE(r.visit_info_id, pr.visit_info_id)
WHERE p.facility_id = sqlc.arg(facility_id) AND c.disabled_at IS NULL
  AND (p.last_end_date IS NULL OR p.last_end_date >= sqlc.arg(from_date)::date)
ORDER BY p.external_calendar_id, p.external_event_id;

-- name: GetCalendarEventProjectionByRecord :one
-- 予定の ID が記録の予定の ID の予定を、記録が指すカレンダーと Google の予定の ID の行で読む。列は ListCalendarEventProjectionsByFacility と同じである。
SELECT p.external_calendar_id, p.external_event_id, p.facility_id, p.staff_id, p.recurring_event_id, p.original_start_at, p.original_start_date,
       p.status, p.title, p.start_at, p.start_date, p.end_at, p.end_date, p.time_zone, p.recurrence, p.etag, p.google_updated_at,
       p.last_end_date, p.projected_at, u.username AS staff_name,
       COALESCE(r.schedule_id, CASE WHEN t.schedule_id IS NULL THEN COALESCE(occurrence_schedule_id(p.external_calendar_id, p.recurring_event_id, p.original_start_at, p.original_start_date), projected_schedule_id(p.external_calendar_id, p.external_event_id))
                                    ELSE COALESCE(detached_occurrence_schedule_id(p.external_calendar_id, p.recurring_event_id, p.original_start_at, p.original_start_date), detached_schedule_id(p.external_calendar_id, p.external_event_id)) END)::text AS schedule_id,
       COALESCE(r.visit_info_id, pr.visit_info_id) AS visit_info_id, vid.patient_id, vid.patient_name, vid.assigned_staff_id, vid.assigned_staff_name,
       vid.companion_id, vid.companion_name, vid.service_code_id, vid.service_code
FROM calendar_event_projections p
JOIN external_calendars c ON c.id = p.external_calendar_id AND c.facility_id = p.facility_id
JOIN users u ON u.id = p.staff_id AND u.facility_id = p.facility_id
LEFT JOIN calendar_event_records r ON r.external_calendar_id = p.external_calendar_id AND r.external_event_id = p.external_event_id
LEFT JOIN calendar_event_records t ON r.schedule_id IS NULL AND t.schedule_id = COALESCE(occurrence_schedule_id(p.external_calendar_id, p.recurring_event_id, p.original_start_at, p.original_start_date), projected_schedule_id(p.external_calendar_id, p.external_event_id))
LEFT JOIN calendar_event_records pr ON p.recurring_event_id IS NOT NULL AND (r.schedule_id IS NULL OR r.version = 0)
                                   AND pr.external_calendar_id = p.external_calendar_id AND pr.external_event_id = p.recurring_event_id
LEFT JOIN visit_info_details vid ON vid.id = COALESCE(r.visit_info_id, pr.visit_info_id)
WHERE r.schedule_id = sqlc.arg(schedule_id) AND p.facility_id = sqlc.arg(facility_id) AND c.disabled_at IS NULL;

-- name: GetCalendarEventProjectionByListID :one
-- 記録の無い予定を、一覧での予定の ID（projected_schedule_id、detached_schedule_id、例外の回の occurrence_schedule_id か detached_occurrence_schedule_id）で読む。列は ListCalendarEventProjectionsByFacility と同じである。
SELECT p.external_calendar_id, p.external_event_id, p.facility_id, p.staff_id, p.recurring_event_id, p.original_start_at, p.original_start_date,
       p.status, p.title, p.start_at, p.start_date, p.end_at, p.end_date, p.time_zone, p.recurrence, p.etag, p.google_updated_at,
       p.last_end_date, p.projected_at, u.username AS staff_name,
       COALESCE(r.schedule_id, CASE WHEN t.schedule_id IS NULL THEN COALESCE(occurrence_schedule_id(p.external_calendar_id, p.recurring_event_id, p.original_start_at, p.original_start_date), projected_schedule_id(p.external_calendar_id, p.external_event_id))
                                    ELSE COALESCE(detached_occurrence_schedule_id(p.external_calendar_id, p.recurring_event_id, p.original_start_at, p.original_start_date), detached_schedule_id(p.external_calendar_id, p.external_event_id)) END)::text AS schedule_id,
       COALESCE(r.visit_info_id, pr.visit_info_id) AS visit_info_id, vid.patient_id, vid.patient_name, vid.assigned_staff_id, vid.assigned_staff_name,
       vid.companion_id, vid.companion_name, vid.service_code_id, vid.service_code
FROM calendar_event_projections p
JOIN external_calendars c ON c.id = p.external_calendar_id AND c.facility_id = p.facility_id
JOIN users u ON u.id = p.staff_id AND u.facility_id = p.facility_id
LEFT JOIN calendar_event_records r ON r.external_calendar_id = p.external_calendar_id AND r.external_event_id = p.external_event_id
LEFT JOIN calendar_event_records t ON r.schedule_id IS NULL AND t.schedule_id = COALESCE(occurrence_schedule_id(p.external_calendar_id, p.recurring_event_id, p.original_start_at, p.original_start_date), projected_schedule_id(p.external_calendar_id, p.external_event_id))
LEFT JOIN calendar_event_records pr ON p.recurring_event_id IS NOT NULL AND (r.schedule_id IS NULL OR r.version = 0)
                                   AND pr.external_calendar_id = p.external_calendar_id AND pr.external_event_id = p.recurring_event_id
LEFT JOIN visit_info_details vid ON vid.id = COALESCE(r.visit_info_id, pr.visit_info_id)
WHERE (projected_schedule_id(p.external_calendar_id, p.external_event_id) = sqlc.arg(schedule_id)
       OR detached_schedule_id(p.external_calendar_id, p.external_event_id) = sqlc.arg(schedule_id)
       OR (p.recurring_event_id IS NOT NULL AND occurrence_schedule_id(p.external_calendar_id, p.recurring_event_id, p.original_start_at, p.original_start_date) = sqlc.arg(schedule_id))
       OR (p.recurring_event_id IS NOT NULL AND detached_occurrence_schedule_id(p.external_calendar_id, p.recurring_event_id, p.original_start_at, p.original_start_date) = sqlc.arg(schedule_id)))
  AND r.schedule_id IS NULL
  AND CASE WHEN t.schedule_id IS NULL THEN COALESCE(occurrence_schedule_id(p.external_calendar_id, p.recurring_event_id, p.original_start_at, p.original_start_date), projected_schedule_id(p.external_calendar_id, p.external_event_id))
           ELSE COALESCE(detached_occurrence_schedule_id(p.external_calendar_id, p.recurring_event_id, p.original_start_at, p.original_start_date), detached_schedule_id(p.external_calendar_id, p.external_event_id)) END = sqlc.arg(schedule_id)
  AND p.facility_id = sqlc.arg(facility_id) AND c.disabled_at IS NULL
ORDER BY p.external_calendar_id, p.external_event_id
LIMIT 1;

-- name: FindOpenCalendarCutoverWithStarter :one
-- 予定の表示の読み出し（scheduleview）が、事業所の open の切り替えを、始めた職員の名前を付けて読む（ADR-0031）。
-- 職員の状態（休職、退職）によらず名前を返す。退職しても名前は残るためである。
SELECT c.started_at, c.range_start, c.started_by, u.username AS started_by_name
FROM calendar_cutovers c
JOIN users u ON u.id = c.started_by AND u.facility_id = c.facility_id
WHERE c.facility_id = sqlc.arg(facility_id) AND c.status = 'open';

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
