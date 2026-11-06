-- 予定と繰り返しの予定に、終了が翌日かを持たせる（ADR-0032）。
-- 前のバージョンのアプリが動いたまま当てられるよう、列は既定値を持たせて足し、ビューは列を末尾に足す。

ALTER TABLE schedules ADD COLUMN ends_next_day boolean NOT NULL DEFAULT false;
ALTER TABLE recurring_schedules ADD COLUMN ends_next_day boolean NOT NULL DEFAULT false;

-- 検査の制約は NOT VALID で足してから確認し、表を走査する間に書き込みを止めない。
ALTER TABLE schedules DROP CONSTRAINT schedules_time_check;
ALTER TABLE schedules ADD CONSTRAINT schedules_time_check
    CHECK (CASE WHEN ends_next_day THEN end_time < start_time ELSE start_time < end_time END) NOT VALID;
ALTER TABLE schedules VALIDATE CONSTRAINT schedules_time_check;
ALTER TABLE recurring_schedules DROP CONSTRAINT recurring_schedules_time_check;
ALTER TABLE recurring_schedules ADD CONSTRAINT recurring_schedules_time_check
    CHECK (CASE WHEN ends_next_day THEN end_time < start_time ELSE start_time < end_time END) NOT VALID;
ALTER TABLE recurring_schedules VALIDATE CONSTRAINT recurring_schedules_time_check;

CREATE OR REPLACE VIEW schedule_details AS
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
       s.created_at, s.updated_at,
       s.version,
       s.ends_next_day
FROM schedules s
JOIN schedule_types st ON st.id = s.schedule_type_id
JOIN users u ON u.id = s.staff_id
LEFT JOIN visit_info_details vid ON vid.id = s.visit_info_id
LEFT JOIN schedule_cancels c ON c.schedule_id = s.id;

CREATE OR REPLACE VIEW recurring_schedule_details AS
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

COMMENT ON COLUMN schedules.ends_next_day IS '終了が翌日か。true なら終了の時刻は開始の時刻より前で、date の翌日のその時刻に終わる';
COMMENT ON COLUMN recurring_schedules.ends_next_day IS '終了が翌日か。全ての回が同じ値を持つ';
