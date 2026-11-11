-- 予定を Google カレンダーで管理している事業所（google_primary）の予定の写し（Projection、ADR-0029）。
-- 同期の処理（calendarsync の ProjectionApplier）だけが書き、予定の表示の読み出し（scheduleview）だけが読む。
-- Google カレンダーの 1 つの予定を 1 行にし、繰り返しの予定は展開せずに親の予定と例外の回を別の行に持つ。
-- 説明、場所、参加者、作成者と主催者のメール、添付は持たない。
CREATE TABLE calendar_event_projections (
    external_calendar_id text COLLATE "C" NOT NULL,
    external_event_id    varchar(1024)    NOT NULL,
    facility_id          text COLLATE "C" NOT NULL,
    staff_id             text COLLATE "C" NOT NULL,
    recurring_event_id   varchar(1024)    NULL,
    original_start_at    timestamptz      NULL,
    original_start_date  date             NULL,
    status               text             NOT NULL,
    title                text             NOT NULL,
    start_at             timestamptz      NULL,
    start_date           date             NULL,
    end_at               timestamptz      NULL,
    end_date             date             NULL,
    time_zone            text             NULL,
    recurrence           text[]           NOT NULL DEFAULT '{}',
    etag                 text             NOT NULL,
    google_updated_at    timestamptz      NULL,
    last_end_date        date             NULL,
    projected_at         timestamptz      NOT NULL DEFAULT now(),
    CONSTRAINT calendar_event_projections_pkey PRIMARY KEY (external_calendar_id, external_event_id),
    CONSTRAINT calendar_event_projections_status_check CHECK (status IN ('confirmed', 'cancelled')),
    -- 取り消した予定のうち、行に残すのは繰り返しの予定の取り消した回だけである。
    CONSTRAINT calendar_event_projections_cancelled_check CHECK (status = 'confirmed' OR recurring_event_id IS NOT NULL),
    CONSTRAINT calendar_event_projections_start_check CHECK (status = 'cancelled' OR num_nonnulls(start_at, start_date) = 1),
    CONSTRAINT calendar_event_projections_end_check CHECK (status = 'cancelled' OR num_nonnulls(end_at, end_date) = 1),
    CONSTRAINT calendar_event_projections_original_check CHECK (num_nonnulls(original_start_at, original_start_date) <= 1),
    CONSTRAINT calendar_event_projections_calendar_fkey FOREIGN KEY (facility_id, external_calendar_id) REFERENCES external_calendars (facility_id, id) ON DELETE CASCADE,
    CONSTRAINT calendar_event_projections_staff_fkey FOREIGN KEY (facility_id, staff_id) REFERENCES users (facility_id, id) ON DELETE CASCADE
);
-- 予定の表示の読み出しが、事業所の行を、読む期間より後に終わる行に絞って読む。
CREATE INDEX calendar_event_projections_facility_end_idx ON calendar_event_projections (facility_id, last_end_date);

COMMENT ON TABLE calendar_event_projections IS '予定を Google カレンダーで管理している事業所の、Google カレンダーの予定の写し（Projection）。1 つの予定を 1 行にする';
COMMENT ON COLUMN calendar_event_projections.external_event_id IS 'Google の予定の ID';
COMMENT ON COLUMN calendar_event_projections.facility_id IS '写した時点のカレンダーの事業所';
COMMENT ON COLUMN calendar_event_projections.staff_id IS '写した時点のカレンダーの職員';
COMMENT ON COLUMN calendar_event_projections.recurring_event_id IS '繰り返しの予定の例外の回のとき、親の予定の ID';
COMMENT ON COLUMN calendar_event_projections.original_start_at IS '例外の回が元の規則で始まるはずだった日時。終日の予定は original_start_date に持つ';
COMMENT ON COLUMN calendar_event_projections.status IS 'confirmed、cancelled。cancelled は繰り返しの予定の取り消した回で、取り消した単発の予定と親の予定は行を消す';
COMMENT ON COLUMN calendar_event_projections.title IS 'Google の予定のタイトル。利用者名を含むが、表示と照合に要るので持つ。取り消した回は空';
COMMENT ON COLUMN calendar_event_projections.start_at IS '開始の日時。終日の予定は start_date に持つ。取り消した回はどちらも NULL';
COMMENT ON COLUMN calendar_event_projections.end_at IS '終了の日時。終日の予定は end_date（Google と同じく、終わる日の翌日）に持つ';
COMMENT ON COLUMN calendar_event_projections.time_zone IS 'Google の予定の開始のタイムゾーン（IANA）。繰り返しの規則はこの暦で数える';
COMMENT ON COLUMN calendar_event_projections.recurrence IS '繰り返しの親の予定の RRULE、EXDATE、RDATE の行';
COMMENT ON COLUMN calendar_event_projections.google_updated_at IS 'Google で予定を最後に変えた時刻';
COMMENT ON COLUMN calendar_event_projections.last_end_date IS 'Asia/Tokyo で予定が終わる日。繰り返しは最後の回、取り消した回は元の開始の日。終わりの無い繰り返しと、最後の回を決められない繰り返しは NULL。保持する期間より前に終わった行を消すのに使う';
COMMENT ON COLUMN calendar_event_projections.projected_at IS '同期が行を書いた時刻';
