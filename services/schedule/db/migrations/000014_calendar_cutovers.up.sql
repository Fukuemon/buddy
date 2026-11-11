-- 事業所の予定の管理を Google カレンダーから buddy に移す作業の記録（移行、Cutover、ADR-0031）。
-- 状態は open から completed か canceled に移る。1 つの事業所に open の移行は 1 つまでにする。
CREATE TABLE calendar_cutovers (
    id          text COLLATE "C" NOT NULL CHECK (id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
    facility_id text COLLATE "C" NOT NULL,
    status      text             NOT NULL,
    range_start date             NOT NULL,
    started_by  text COLLATE "C" NOT NULL,
    started_at  timestamptz      NOT NULL DEFAULT now(),
    finished_at timestamptz      NULL,
    created_at  timestamptz      NOT NULL DEFAULT now(),
    updated_at  timestamptz      NOT NULL DEFAULT now(),
    CONSTRAINT calendar_cutovers_pkey PRIMARY KEY (id),
    CONSTRAINT calendar_cutovers_facility_id_key UNIQUE (facility_id, id),
    CONSTRAINT calendar_cutovers_status_check CHECK (status IN ('open', 'completed', 'canceled')),
    CONSTRAINT calendar_cutovers_finished_check CHECK ((status = 'open') = (finished_at IS NULL)),
    CONSTRAINT calendar_cutovers_range_start_check CHECK (EXTRACT(DAY FROM range_start) = 1),
    CONSTRAINT calendar_cutovers_facility_fkey FOREIGN KEY (facility_id) REFERENCES facilities (id),
    CONSTRAINT calendar_cutovers_started_by_fkey FOREIGN KEY (facility_id, started_by) REFERENCES users (facility_id, id)
);
-- 1 つの事業所に、open の移行は 1 つまでである。
CREATE UNIQUE INDEX calendar_cutovers_open_key ON calendar_cutovers (facility_id) WHERE status = 'open';
CREATE INDEX calendar_cutovers_started_by_idx ON calendar_cutovers (facility_id, started_by);
CREATE TRIGGER calendar_cutovers_set_updated_at BEFORE UPDATE ON calendar_cutovers FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 移行の取り込みで、確認が必要な予定に取り込まないを選んだ記録。完了は、この記録のある予定を取り込まないと決めた予定として扱う。
-- カレンダーの取り込みのたびに、そのカレンダーの記録を、その取り込みで選んだものに置き換える。
CREATE TABLE calendar_cutover_skips (
    cutover_id           text COLLATE "C" NOT NULL,
    facility_id          text COLLATE "C" NOT NULL,
    external_calendar_id text COLLATE "C" NOT NULL,
    external_event_id    varchar(1024)    NOT NULL,
    revision             varchar(64)      NOT NULL,
    created_at           timestamptz      NOT NULL DEFAULT now(),
    CONSTRAINT calendar_cutover_skips_pkey PRIMARY KEY (cutover_id, external_calendar_id, external_event_id),
    CONSTRAINT calendar_cutover_skips_cutover_fkey FOREIGN KEY (facility_id, cutover_id) REFERENCES calendar_cutovers (facility_id, id) ON DELETE CASCADE,
    CONSTRAINT calendar_cutover_skips_calendar_fkey FOREIGN KEY (facility_id, external_calendar_id) REFERENCES external_calendars (facility_id, id) ON DELETE CASCADE
);
CREATE INDEX calendar_cutover_skips_calendar_idx ON calendar_cutover_skips (facility_id, external_calendar_id);

-- 移行の取り込みの記録に、移行を持たせる。移行の取り込みの期間は終わりを持たないので、終わりの日を NULL にできるようにする。
-- 終わりの日の無い取り込みは、移行の取り込みだけである。
ALTER TABLE import_runs ADD COLUMN cutover_id text COLLATE "C" NULL;
ALTER TABLE import_runs ALTER COLUMN range_end DROP NOT NULL;
ALTER TABLE import_runs ADD CONSTRAINT import_runs_open_range_check CHECK (range_end IS NOT NULL OR cutover_id IS NOT NULL);
ALTER TABLE import_runs ADD CONSTRAINT import_runs_cutover_fkey FOREIGN KEY (facility_id, cutover_id) REFERENCES calendar_cutovers (facility_id, id);
CREATE INDEX import_runs_cutover_idx ON import_runs (facility_id, cutover_id) WHERE cutover_id IS NOT NULL;

-- 移行の取り込みで作った予定の対応に、移行を持たせる。移行をやめると、この対応と予定を消す。
ALTER TABLE external_event_links ADD COLUMN cutover_id text COLLATE "C" NULL;
ALTER TABLE external_event_links ADD CONSTRAINT external_event_links_cutover_fkey FOREIGN KEY (facility_id, cutover_id) REFERENCES calendar_cutovers (facility_id, id);
CREATE INDEX external_event_links_cutover_idx ON external_event_links (facility_id, cutover_id) WHERE cutover_id IS NOT NULL;

COMMENT ON TABLE calendar_cutovers IS '事業所の予定の管理を Google カレンダーから buddy に移す作業の記録（移行）。事業所ごとに open は 1 つまで';
COMMENT ON COLUMN calendar_cutovers.status IS 'open、completed、canceled。completed で事業所を buddy_primary にし、canceled は google_primary のまま';
COMMENT ON COLUMN calendar_cutovers.range_start IS '取り込みの期間の最初の日。移行を始めた月の初日。期間は終わりを持たない';
COMMENT ON COLUMN calendar_cutovers.started_by IS '移行を始めた職員';
COMMENT ON COLUMN calendar_cutovers.finished_at IS '完了したかやめた時刻。open なら NULL';
COMMENT ON TABLE calendar_cutover_skips IS '移行の取り込みで、確認が必要な予定に取り込まないを選んだ記録';
COMMENT ON COLUMN calendar_cutover_skips.external_event_id IS '取り込み方を選んだ Google の予定の ID。繰り返しの予定とその回では、親の予定の ID';
COMMENT ON COLUMN calendar_cutover_skips.revision IS '取り込み方を選んだときの、確認が必要な予定のバージョン。Google で予定が変わると変わり、記録は当たらなくなる';
COMMENT ON COLUMN import_runs.range_end IS '取り込む期間の最後の日。この日を含む。移行の取り込みでは NULL（終わりを持たない）';
COMMENT ON COLUMN import_runs.cutover_id IS '移行の取り込みのとき、その移行';
COMMENT ON COLUMN external_event_links.cutover_id IS '移行の取り込みで作った対応のとき、その移行。移行をやめると、この対応と予定を消す';
