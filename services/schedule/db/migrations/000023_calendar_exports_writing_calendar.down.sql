-- 戻すと、作ろうとしたカレンダーを忘れる。対応の無いまま残った外部の予定は、次に書いても消されない。
DROP INDEX calendar_exports_facility_writing_calendar_idx;
ALTER TABLE calendar_exports DROP COLUMN writing_calendar_id;
