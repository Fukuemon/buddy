-- 書き出しが外部の予定を作る前に、作る先のカレンダーを待ちに書く（#964）。
-- 作った後で予定の対応を書けずに止まったときと、作っている間に予定を削除したときに、対応の無い外部の予定を、次に書くときに消すためである。
ALTER TABLE calendar_exports ADD COLUMN writing_calendar_id text COLLATE "C" NULL;
ALTER TABLE calendar_exports ADD CONSTRAINT calendar_exports_writing_calendar_fkey
    FOREIGN KEY (facility_id, writing_calendar_id) REFERENCES external_calendars (facility_id, id) ON DELETE SET NULL (writing_calendar_id);
CREATE INDEX calendar_exports_facility_writing_calendar_idx ON calendar_exports (facility_id, writing_calendar_id) WHERE writing_calendar_id IS NOT NULL;

COMMENT ON COLUMN calendar_exports.writing_calendar_id IS '外部の予定を作ろうとしたカレンダー。作る前に書き、書き終えたら NULL にする。予定の対応が無いまま残った外部の予定を、次に書くときに消す';
