-- 毎週の行の day_of_week を最初の日付の曜日に戻す。複数の曜日と 2 以上の間隔は戻せず、最初の日付の曜日の毎週になる。
-- 最初の日付は曜日の並びのどれかに当たるので、前のバージョンでも最初の日付が回に当たる。

UPDATE recurring_schedules SET day_of_week = EXTRACT(ISODOW FROM date)::smallint WHERE frequency = 'weekly' AND days_of_week IS NOT NULL;

-- CREATE OR REPLACE VIEW は列を消せないので、作り直してから列を消す。
DROP VIEW recurring_schedule_details;

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
       rs.created_at, rs.updated_at,
       rs.version,
       rs.ends_next_day
FROM recurring_schedules rs
JOIN schedule_types st ON st.id = rs.schedule_type_id
JOIN users u ON u.id = rs.staff_id
LEFT JOIN visit_info_details vid ON vid.id = rs.visit_info_id;

COMMENT ON VIEW recurring_schedule_details IS '一覧の読み出しに使う、繰り返しの予定と訪問の情報と名前を結合したビュー';

ALTER TABLE recurring_schedules DROP CONSTRAINT recurring_schedules_monthly_weekly_fields_check;
ALTER TABLE recurring_schedules DROP CONSTRAINT recurring_schedules_interval_weeks_check;
ALTER TABLE recurring_schedules DROP CONSTRAINT recurring_schedules_days_of_week_check;
ALTER TABLE recurring_schedules DROP COLUMN interval_weeks;
ALTER TABLE recurring_schedules DROP COLUMN days_of_week;

COMMENT ON COLUMN recurring_schedules.day_of_week IS '1（月曜）から 7';
