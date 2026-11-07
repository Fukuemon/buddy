CREATE TABLE calendar_event_records (
    schedule_id           text COLLATE "C" NOT NULL CHECK (schedule_id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
    facility_id           text COLLATE "C" NOT NULL,
    external_calendar_id  text COLLATE "C" NOT NULL,
    external_event_id     varchar(1024)    NOT NULL,
    visit_info_id         text COLLATE "C" NULL,
    version               integer          NOT NULL DEFAULT 0,
    pending_version       integer          NULL,
    pending_state         text             NULL,
    pending_visit_info_id text COLLATE "C" NULL,
    pending_deadline      timestamptz      NULL,
    created_at            timestamptz      NOT NULL DEFAULT now(),
    updated_at            timestamptz      NOT NULL DEFAULT now(),
    CONSTRAINT calendar_event_records_pkey PRIMARY KEY (schedule_id),
    CONSTRAINT calendar_event_records_event_key UNIQUE (external_calendar_id, external_event_id),
    CONSTRAINT calendar_event_records_version_check CHECK (version >= 0),
    CONSTRAINT calendar_event_records_unconfirmed_check CHECK (version > 0 OR (pending_version IS NOT NULL AND visit_info_id IS NULL)),
    CONSTRAINT calendar_event_records_pending_state_check CHECK (pending_state IN ('writing', 'unknown')),
    CONSTRAINT calendar_event_records_pending_check CHECK (
        (pending_version IS NULL AND pending_state IS NULL AND pending_visit_info_id IS NULL AND pending_deadline IS NULL)
        OR (pending_version IS NOT NULL AND pending_state IS NOT NULL AND pending_deadline IS NOT NULL)
    ),
    CONSTRAINT calendar_event_records_pending_version_check CHECK (pending_version > version),
    CONSTRAINT calendar_event_records_facility_fkey FOREIGN KEY (facility_id) REFERENCES facilities (id),
    CONSTRAINT calendar_event_records_calendar_fkey FOREIGN KEY (facility_id, external_calendar_id) REFERENCES external_calendars (facility_id, id) ON DELETE CASCADE,
    CONSTRAINT calendar_event_records_visit_info_fkey FOREIGN KEY (facility_id, visit_info_id) REFERENCES visit_infos (facility_id, id),
    CONSTRAINT calendar_event_records_pending_visit_info_fkey FOREIGN KEY (facility_id, pending_visit_info_id) REFERENCES visit_infos (facility_id, id)
);
CREATE INDEX calendar_event_records_calendar_idx ON calendar_event_records (facility_id, external_calendar_id);
CREATE INDEX calendar_event_records_visit_info_idx ON calendar_event_records (visit_info_id) WHERE visit_info_id IS NOT NULL;
CREATE INDEX calendar_event_records_pending_visit_info_idx ON calendar_event_records (pending_visit_info_id) WHERE pending_visit_info_id IS NOT NULL;
CREATE TRIGGER calendar_event_records_set_updated_at BEFORE UPDATE ON calendar_event_records FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE calendar_event_records IS 'google_primary の事業所で、予定の API が Google カレンダーに書いた予定の、訪問の情報と書き込みの保留の版（ADR-0029）。通常の予定も保留の版を持つために行を作る';
COMMENT ON COLUMN calendar_event_records.schedule_id IS 'buddy の予定の ID。画面が作成のリクエストに付ける。Google の予定の ID はこの ID から決める';
COMMENT ON COLUMN calendar_event_records.external_calendar_id IS '予定を書いた、結び付けたカレンダー';
COMMENT ON COLUMN calendar_event_records.external_event_id IS 'Google の予定の ID';
COMMENT ON COLUMN calendar_event_records.visit_info_id IS 'Google が受けた版の訪問の情報。通常の予定と、まだ版を確定していない行は NULL';
COMMENT ON COLUMN calendar_event_records.version IS 'Google が受けたと分かった最後の版。0 は、まだ受けたと分かっていない。0 の行は保留の版を持つ';
COMMENT ON COLUMN calendar_event_records.pending_version IS '書き込みの保留の版。Google の予定の extendedProperties.private の buddyVersion に置く。保留が無ければ NULL で、保留の状態、訪問の情報、書く期限も NULL';
COMMENT ON COLUMN calendar_event_records.pending_state IS 'writing（書いている途中）、unknown（Google が受けたかが分からない）';
COMMENT ON COLUMN calendar_event_records.pending_visit_info_id IS '保留の版の訪問の情報。版を確定すると visit_info_id に移す';
COMMENT ON COLUMN calendar_event_records.pending_deadline IS '書く期限。保留の版を書いた時刻に、Google を呼ぶ時間の上限と余裕を足した時刻';
