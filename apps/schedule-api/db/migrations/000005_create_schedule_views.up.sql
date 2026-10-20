CREATE VIEW visit_info_details AS
SELECT vi.id,
       vi.patient_id, pa.name AS patient_name,
       vi.assigned_staff_id, au.username AS assigned_staff_name,
       vi.companion_id, cu.username AS companion_name,
       vi.service_code_id, sc.code AS service_code
FROM visit_infos vi
JOIN patients pa ON pa.id = vi.patient_id
JOIN users au ON au.id = vi.assigned_staff_id
LEFT JOIN users cu ON cu.id = vi.companion_id
JOIN service_codes sc ON sc.id = vi.service_code_id;

CREATE VIEW schedule_details AS
SELECT s.id, s.facility_id,
       s.schedule_type_id, st.name AS schedule_type_name,
       s.date, s.start_time, s.end_time, s.is_over_time_work,
       s.staff_id, u.username AS staff_name,
       s.title, s.description, s.recurring_schedule_id,
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
       rs.schedule_type_id, st.name AS schedule_type_name,
       rs.date, rs.start_time, rs.end_time, rs.is_over_time_work,
       rs.staff_id, u.username AS staff_name,
       rs.title, rs.description,
       rs.recurring_rule_id, rr.frequency, rr.day_of_week, rr.day_of_month, rr.week_of_month, rr.end_date,
       rs.visit_info_id,
       vid.patient_id, vid.patient_name,
       vid.assigned_staff_id, vid.assigned_staff_name,
       vid.companion_id, vid.companion_name,
       vid.service_code_id, vid.service_code,
       rs.created_at, rs.updated_at
FROM recurring_schedules rs
JOIN schedule_types st ON st.id = rs.schedule_type_id
JOIN users u ON u.id = rs.staff_id
JOIN recurring_rules rr ON rr.id = rs.recurring_rule_id
LEFT JOIN visit_info_details vid ON vid.id = rs.visit_info_id;
