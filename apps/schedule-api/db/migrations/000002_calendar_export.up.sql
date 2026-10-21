-- Google カレンダーへの書き出し（ADR-0009 の段階 2）の列と表。
-- 前のバージョンのアプリが動いたまま当てられるよう、列は既定値を持たせて足し、ビューは列を末尾に足す。

ALTER TABLE schedules ADD COLUMN version integer NOT NULL DEFAULT 1;
ALTER TABLE schedules ADD CONSTRAINT schedules_version_check CHECK (version >= 1);
ALTER TABLE recurring_schedules ADD COLUMN version integer NOT NULL DEFAULT 1;
ALTER TABLE recurring_schedules ADD CONSTRAINT recurring_schedules_version_check CHECK (version >= 1);

ALTER TABLE external_event_links ADD COLUMN synced_version integer NULL;
ALTER TABLE external_event_links ADD CONSTRAINT external_event_links_synced_version_check CHECK (synced_version >= 1);

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
       s.version
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
       rs.version
FROM recurring_schedules rs
JOIN schedule_types st ON st.id = rs.schedule_type_id
JOIN users u ON u.id = rs.staff_id
LEFT JOIN visit_info_details vid ON vid.id = rs.visit_info_id;

-- 書き出しの待ち（outbox）。予定ごとに、終わっていない行は 1 つだけ持つ。終わっていない行に積み直すと revision が増える。
CREATE TABLE calendar_exports (
    id                    text COLLATE "C" NOT NULL CHECK (id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
    facility_id           text COLLATE "C" NOT NULL,
    schedule_id           text COLLATE "C" NULL,
    recurring_schedule_id text COLLATE "C" NULL,
    status                text             NOT NULL DEFAULT 'pending',
    revision              integer          NOT NULL DEFAULT 1,
    attempts              integer          NOT NULL DEFAULT 0,
    next_attempt_at       timestamptz      NOT NULL DEFAULT now(),
    locked_until          timestamptz      NULL,
    overwrite             boolean          NOT NULL DEFAULT false,
    error_code            text             NULL,
    finished_at           timestamptz      NULL,
    created_at            timestamptz      NOT NULL DEFAULT now(),
    updated_at            timestamptz      NOT NULL DEFAULT now(),
    CONSTRAINT calendar_exports_pkey PRIMARY KEY (id),
    CONSTRAINT calendar_exports_facility_id_key UNIQUE (facility_id, id),
    CONSTRAINT calendar_exports_target_check CHECK (num_nonnulls(schedule_id, recurring_schedule_id) = 1),
    CONSTRAINT calendar_exports_status_check CHECK (status IN ('pending', 'succeeded', 'conflict', 'failed')),
    CONSTRAINT calendar_exports_error_code_check CHECK (error_code IN ('precondition_failed', 'not_found', 'forbidden', 'unavailable')),
    CONSTRAINT calendar_exports_count_check CHECK (revision >= 1 AND attempts >= 0),
    CONSTRAINT calendar_exports_finished_check CHECK ((status = 'succeeded') = (finished_at IS NOT NULL)),
    CONSTRAINT calendar_exports_facility_fkey FOREIGN KEY (facility_id) REFERENCES facilities (id),
    CONSTRAINT calendar_exports_schedule_fkey FOREIGN KEY (facility_id, schedule_id) REFERENCES schedules (facility_id, id) ON DELETE CASCADE,
    CONSTRAINT calendar_exports_recurring_schedule_fkey FOREIGN KEY (facility_id, recurring_schedule_id) REFERENCES recurring_schedules (facility_id, id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX calendar_exports_open_schedule_key ON calendar_exports (schedule_id) WHERE status <> 'succeeded' AND schedule_id IS NOT NULL;
CREATE UNIQUE INDEX calendar_exports_open_recurring_schedule_key ON calendar_exports (recurring_schedule_id) WHERE status <> 'succeeded' AND recurring_schedule_id IS NOT NULL;
CREATE INDEX calendar_exports_due_idx ON calendar_exports (next_attempt_at, id) WHERE status = 'pending';
CREATE INDEX calendar_exports_facility_status_idx ON calendar_exports (facility_id, status);
CREATE INDEX calendar_exports_facility_schedule_idx ON calendar_exports (facility_id, schedule_id) WHERE schedule_id IS NOT NULL;
CREATE INDEX calendar_exports_facility_recurring_schedule_idx ON calendar_exports (facility_id, recurring_schedule_id) WHERE recurring_schedule_id IS NOT NULL;
CREATE TRIGGER calendar_exports_set_updated_at BEFORE UPDATE ON calendar_exports FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON COLUMN schedules.version IS '更新の番号。予定を変えるかキャンセルするたびに 1 つ増える';
COMMENT ON COLUMN recurring_schedules.version IS '更新の番号。回を除外するたびに 1 つ増える';
COMMENT ON COLUMN external_event_links.synced_version IS '最後に外部の予定と同じにした時点の、buddy の予定の更新の番号。この列を足す前の行は NULL';
COMMENT ON TABLE calendar_exports IS '予定を外部のカレンダーに書き出す待ち。予定の変更と同じトランザクションで積む';
COMMENT ON COLUMN calendar_exports.status IS 'pending（書く）、succeeded（書いた）、conflict（外部で変わっていた）、failed（書けなかった）';
COMMENT ON COLUMN calendar_exports.revision IS '終わっていない行に積み直した回数に 1 を足した値。書いている間に積み直されたかを比べる';
COMMENT ON COLUMN calendar_exports.attempts IS '書こうとした回数。再送の間隔と上限に使う';
COMMENT ON COLUMN calendar_exports.next_attempt_at IS 'この時刻より後に書く';
COMMENT ON COLUMN calendar_exports.locked_until IS '書いている処理が持つ期限。過ぎたら、ほかの処理が書いてよい';
COMMENT ON COLUMN calendar_exports.overwrite IS '外部の予定の etag を比べずに、buddy の内容で書き直すか';
COMMENT ON COLUMN calendar_exports.error_code IS '最後に書けなかった理由。外部の予定の題名とカレンダーの ID を含めない';
