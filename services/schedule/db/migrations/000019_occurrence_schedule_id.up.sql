-- 一覧（scheduleview）は、繰り返しの予定の回に、カレンダー、親の予定の ID、回の元の日付から作る予定の ID を返す（ADR-0026）。
-- 回を Google の例外の回に変えても ID が変わらないよう、例外の回の行にも同じ値を返し、予定の API がその ID で行を引けるよう、
-- 同じ値を SQL で作って式の索引を張る。値は scheduleview.OccurrenceScheduleID と同じで、SHA-256 の先頭の 128 ビットを、
-- ULID と同じ 26 文字の Crockford の Base32 にする。元の日付は、元の開始の時刻の Asia/Tokyo の日付か、終日の予定の元の日付である。
-- Asia/Tokyo は夏時間を持たないので、日付の変換を IMMUTABLE として扱い、式の索引に使う。
CREATE FUNCTION occurrence_schedule_id(external_calendar_id text, parent_event_id text, original_start_at timestamptz, original_start_date date)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
    SELECT string_agg(substr('0123456789ABCDEFGHJKMNPQRSTVWXYZ', substring(b FROM i * 5 + 1 FOR 5)::integer + 1, 1), '' ORDER BY i)
    FROM (
        SELECT B'00' || ('x' || encode(substring(sha256(
            convert_to($1, 'UTF8') || '\x00'::bytea || convert_to($2, 'UTF8') || '\x00'::bytea
            || convert_to(to_char(COALESCE($4, ($3 AT TIME ZONE 'Asia/Tokyo')::date), 'YYYY-MM-DD'), 'UTF8')
        ) FROM 1 FOR 16), 'hex'))::bit(128) AS b
        WHERE $1 IS NOT NULL AND $2 IS NOT NULL AND ($3 IS NOT NULL OR $4 IS NOT NULL)
    ) h, generate_series(0, 25) AS i
$$;

COMMENT ON FUNCTION occurrence_schedule_id(text, text, timestamptz, date) IS '繰り返しの予定の回の、一覧での予定の ID。scheduleview.OccurrenceScheduleID と同じ値を返す。親の予定の ID か元の開始が無ければ NULL';

CREATE INDEX calendar_event_projections_occurrence_id_idx ON calendar_event_projections
    (occurrence_schedule_id(external_calendar_id, recurring_event_id, original_start_at, original_start_date))
    WHERE recurring_event_id IS NOT NULL;

-- 回を別の職員のカレンダーに移すと、回の記録の主キー（occurrence_schedule_id）は移した単発の予定を指す。元の回を消せなかったとき、
-- 元のカレンダーに残った例外の回の行は記録を持たず、移した予定と同じ occurrence_schedule_id になる。その行には、重ならない別の ID を返す。
-- detached_schedule_id と同じく、Google の予定の ID に使われない文字（0x01）と固定の語を、親の予定の ID に足して作る。
-- 値は scheduleview.DetachedOccurrenceScheduleID と同じである。
CREATE FUNCTION detached_occurrence_schedule_id(external_calendar_id text, parent_event_id text, original_start_at timestamptz, original_start_date date)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
    SELECT public.occurrence_schedule_id($1, $2 || E'\x01detached', $3, $4)
$$;

COMMENT ON FUNCTION detached_occurrence_schedule_id(text, text, timestamptz, date) IS '記録の無い例外の回の行の occurrence_schedule_id が、ほかの予定を指す記録の主キーと同じときの、一覧での予定の ID。scheduleview.DetachedOccurrenceScheduleID と同じ値を返す';

CREATE INDEX calendar_event_projections_detached_occurrence_id_idx ON calendar_event_projections
    (detached_occurrence_schedule_id(external_calendar_id, recurring_event_id, original_start_at, original_start_date))
    WHERE recurring_event_id IS NOT NULL;
