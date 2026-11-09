-- 終わりの日の無い取り込みの記録は、前の制約に合わないので消す。
DELETE FROM import_runs WHERE range_end IS NULL;
ALTER TABLE external_event_links DROP COLUMN cutover_id;
ALTER TABLE import_runs DROP CONSTRAINT import_runs_open_range_check;
ALTER TABLE import_runs DROP COLUMN cutover_id;
ALTER TABLE import_runs ALTER COLUMN range_end SET NOT NULL;
COMMENT ON COLUMN import_runs.range_end IS '取り込む期間の最後の日。この日を含む';
DROP TABLE calendar_cutover_skips;
DROP TABLE calendar_cutovers;
