-- 日時を読めない予定の行は、元の制約を満たさないので消す。次の同期は、元のとおり行を書かない。
DELETE FROM calendar_event_projections WHERE time_unreadable;

ALTER TABLE calendar_event_projections DROP CONSTRAINT calendar_event_projections_start_check;
ALTER TABLE calendar_event_projections DROP CONSTRAINT calendar_event_projections_end_check;
ALTER TABLE calendar_event_projections ADD CONSTRAINT calendar_event_projections_start_check CHECK (status = 'cancelled' OR num_nonnulls(start_at, start_date) = 1);
ALTER TABLE calendar_event_projections ADD CONSTRAINT calendar_event_projections_end_check CHECK (status = 'cancelled' OR num_nonnulls(end_at, end_date) = 1);
ALTER TABLE calendar_event_projections DROP COLUMN time_unreadable;
