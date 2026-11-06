-- 予定の API は、主訪問者を替えた予定を、新しい職員のカレンダーに作り直して移す（ADR-0026）。
-- 移す書き込みの結果が分からないときも同期が読み戻せるよう、移す先のカレンダーと Google の予定の ID を保留の版に持つ。
ALTER TABLE calendar_event_records
    ADD COLUMN pending_external_calendar_id text COLLATE "C" NULL,
    ADD COLUMN pending_external_event_id    varchar(1024)    NULL,
    ADD CONSTRAINT calendar_event_records_pending_move_check CHECK (
        (pending_external_calendar_id IS NULL AND pending_external_event_id IS NULL)
        OR (pending_external_calendar_id IS NOT NULL AND pending_external_event_id IS NOT NULL AND pending_version IS NOT NULL)
    ),
    ADD CONSTRAINT calendar_event_records_pending_calendar_fkey FOREIGN KEY (facility_id, pending_external_calendar_id)
        REFERENCES external_calendars (facility_id, id) ON DELETE CASCADE;

COMMENT ON COLUMN calendar_event_records.pending_external_calendar_id IS '保留の版が予定を別のカレンダーに移す書き込みのときの、移す先のカレンダー。移さない書き込みと、保留が無い行は NULL。版を確定すると external_calendar_id に移す';
COMMENT ON COLUMN calendar_event_records.pending_external_event_id IS '移す先のカレンダーに作る Google の予定の ID。pending_external_calendar_id と一緒に NULL になる';

-- 一覧（scheduleview）は、記録の無い Projection の予定に、カレンダーと Google の予定の ID から作る予定の ID を返す。
-- 予定の API がその ID で予定を引けるよう、同じ値を SQL で作り、式の索引を張る。値は scheduleview.ProjectedScheduleID と同じで、
-- SHA-256 の先頭の 128 ビットを、ULID と同じ 26 文字の Crockford の Base32 にする。
CREATE FUNCTION projected_schedule_id(external_calendar_id text, external_event_id text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
AS $$
    SELECT string_agg(substr('0123456789ABCDEFGHJKMNPQRSTVWXYZ', substring(b FROM i * 5 + 1 FOR 5)::integer + 1, 1), '' ORDER BY i)
    FROM (
        SELECT B'00' || ('x' || encode(substring(sha256(convert_to($1, 'UTF8') || '\x00'::bytea || convert_to($2, 'UTF8')) FROM 1 FOR 16), 'hex'))::bit(128) AS b
    ) h, generate_series(0, 25) AS i
$$;

COMMENT ON FUNCTION projected_schedule_id(text, text) IS '記録の無い Projection の予定の、一覧での予定の ID。scheduleview.ProjectedScheduleID と同じ値を返す';

CREATE INDEX calendar_event_projections_schedule_id_idx ON calendar_event_projections (projected_schedule_id(external_calendar_id, external_event_id));
