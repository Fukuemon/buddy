DROP TABLE calendar_exports;

-- CREATE OR REPLACE VIEW は列を消せないので、作り直してから列を消す。
DROP VIEW recurring_schedule_details;
DROP VIEW schedule_details;

CREATE VIEW schedule_details AS
SELECT s.id, s.facility_id,
       s.schedule_type_id, st.code AS schedule_type_code, st.name AS schedule_type_name,
       s.date, s.start_time, s.end_time, s.is_over_time_work,
       s.staff_id, u.username AS staff_name,
       s.title, s.description, s.recurring_schedule_id, s.original_date,
       s.visit_info_id,
       vid.patient_id, vid.patient_name,
       vid.assigned_staff_id, vid.assigned_staff_name,
       vid.companion_id, vid.companion_name,
       vid.service_code_id, vid.service_code,
       c.id AS cancel_id, c.reason AS cancel_reason,
       s.created_at, s.updated_at
FROM schedules s
JOIN schedule_types st ON st.id = s.schedule_type_id
JOIN users u ON u.id = s.staff_id
LEFT JOIN visit_info_details vid ON vid.id = s.visit_info_id
LEFT JOIN schedule_cancels c ON c.schedule_id = s.id;

CREATE VIEW recurring_schedule_details AS
SELECT rs.id, rs.facility_id,
       rs.schedule_type_id, st.code AS schedule_type_code, st.name AS schedule_type_name,
       rs.date, rs.start_time, rs.end_time, rs.is_over_time_work,
       rs.staff_id, u.username AS staff_name,
       rs.title, rs.description,
       rs.frequency, rs.day_of_week, rs.day_of_month, rs.week_of_month, rs.end_date,
       rs.visit_info_id,
       vid.patient_id, vid.patient_name,
       vid.assigned_staff_id, vid.assigned_staff_name,
       vid.companion_id, vid.companion_name,
       vid.service_code_id, vid.service_code,
       rs.created_at, rs.updated_at
FROM recurring_schedules rs
JOIN schedule_types st ON st.id = rs.schedule_type_id
JOIN users u ON u.id = rs.staff_id
LEFT JOIN visit_info_details vid ON vid.id = rs.visit_info_id;

COMMENT ON VIEW schedule_details IS '一覧の読み出しに使う、予定と訪問の情報と名前を結合したビュー';
COMMENT ON VIEW recurring_schedule_details IS '一覧の読み出しに使う、繰り返しの予定と訪問の情報と名前を結合したビュー';

ALTER TABLE external_event_links DROP COLUMN synced_version;
ALTER TABLE recurring_schedules DROP COLUMN version;
ALTER TABLE schedules DROP COLUMN version;
