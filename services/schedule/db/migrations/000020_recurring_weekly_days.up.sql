-- 毎週の繰り返しの規則に、重ならない複数の曜日と、1〜52 の間隔（週の数）を持たせる（ADR-0038）。
-- 前のバージョンのアプリが動いたまま当てられ、切り戻した後も書けるよう、曜日の並びは NULL を許して足し、間隔は既定値を持たせて足す。
-- 毎週の行の曜日の並びが NULL のときは、day_of_week の曜日、それも無ければ最初の日付の曜日の 1 つの並びとして読む。
-- 毎週の曜日の並びの重なりと並びの順は、アプリが確認して月曜から日曜の順に書く。

ALTER TABLE recurring_schedules ADD COLUMN days_of_week smallint[] NULL;
ALTER TABLE recurring_schedules ADD COLUMN interval_weeks smallint NOT NULL DEFAULT 1;

-- 既にある毎週の行は、今の曜日（値が無ければ最初の日付の曜日）の 1 つの並びに移す。間隔は既定値の 1 になり、回は変わらない。
UPDATE recurring_schedules
SET days_of_week = ARRAY[COALESCE(day_of_week, EXTRACT(ISODOW FROM date)::smallint)], day_of_week = NULL
WHERE frequency = 'weekly';

-- 検査の制約は NOT VALID で足してから確認し、表を走査する間に書き込みを止めない。
ALTER TABLE recurring_schedules ADD CONSTRAINT recurring_schedules_days_of_week_check
    CHECK (cardinality(days_of_week) BETWEEN 1 AND 7 AND days_of_week <@ ARRAY[1, 2, 3, 4, 5, 6, 7]::smallint[]) NOT VALID;
ALTER TABLE recurring_schedules VALIDATE CONSTRAINT recurring_schedules_days_of_week_check;
ALTER TABLE recurring_schedules ADD CONSTRAINT recurring_schedules_interval_weeks_check
    CHECK (interval_weeks BETWEEN 1 AND 52) NOT VALID;
ALTER TABLE recurring_schedules VALIDATE CONSTRAINT recurring_schedules_interval_weeks_check;
ALTER TABLE recurring_schedules ADD CONSTRAINT recurring_schedules_monthly_weekly_fields_check
    CHECK (frequency = 'weekly' OR (days_of_week IS NULL AND interval_weeks = 1)) NOT VALID;
ALTER TABLE recurring_schedules VALIDATE CONSTRAINT recurring_schedules_monthly_weekly_fields_check;

-- 前のバージョンのアプリは、規則を書き換えるときに曜日の並びと間隔を書かない。頻度、day_of_week、最初の日付を変えたのに
-- 曜日の並びと間隔が元のままの書き込みは、前のバージョンの書き込みとみなし、曜日の並びを NULL、間隔を 1 にする。
-- 残すと、毎月に変えた行が検査の制約に反し、曜日を変えた行が古い曜日の並びで読まれるためである。
-- このバージョンのアプリは、頻度か最初の日付を変えるときに、必ず曜日の並びか間隔も変える（終了日だけの変更は最初の日付を変えない）。
CREATE FUNCTION recurring_schedules_clear_stale_weekly_days() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.days_of_week IS NOT DISTINCT FROM OLD.days_of_week AND NEW.interval_weeks = OLD.interval_weeks
       AND (NEW.frequency, NEW.day_of_week, NEW.date) IS DISTINCT FROM (OLD.frequency, OLD.day_of_week, OLD.date) THEN
        NEW.days_of_week := NULL;
        NEW.interval_weeks := 1;
    END IF;
    RETURN NEW;
END
$$;

COMMENT ON FUNCTION recurring_schedules_clear_stale_weekly_days() IS '前のバージョンのアプリが規則を書き換えたときに、元のままの曜日の並びと間隔を外す';

CREATE TRIGGER recurring_schedules_clear_stale_weekly_days BEFORE UPDATE ON recurring_schedules
    FOR EACH ROW EXECUTE FUNCTION recurring_schedules_clear_stale_weekly_days();

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
       rs.ends_next_day,
       rs.days_of_week, rs.interval_weeks
FROM recurring_schedules rs
JOIN schedule_types st ON st.id = rs.schedule_type_id
JOIN users u ON u.id = rs.staff_id
LEFT JOIN visit_info_details vid ON vid.id = rs.visit_info_id;

COMMENT ON COLUMN recurring_schedules.day_of_week IS '1（月曜）から 7。毎月の week_of_month と組で使う。前のバージョンのアプリは毎週の曜日にも書く';
COMMENT ON COLUMN recurring_schedules.days_of_week IS '毎週の、重ならない 1（月曜）から 7 の曜日を月曜から日曜の順に並べたもの。毎月は NULL。毎週の NULL は day_of_week か最初の日付の曜日として読む';
COMMENT ON COLUMN recurring_schedules.interval_weeks IS '毎週の間隔の週の数。1 が毎週、2 が隔週。日曜に始まる週で、最初の日付を含む週から数える。毎月は 1';
