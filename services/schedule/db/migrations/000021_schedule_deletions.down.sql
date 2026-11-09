-- 削除した予定の対応と待ちは、指す予定が無いので消す。まだ書き出していない削除は、Google の予定が消されないまま残る。
DELETE FROM calendar_exports WHERE deleted_schedule_id IS NOT NULL;
DELETE FROM external_event_links WHERE deleted_schedule_id IS NOT NULL;

DROP INDEX calendar_exports_facility_deleted_schedule_idx;
DROP INDEX calendar_exports_open_deleted_schedule_key;
ALTER TABLE calendar_exports DROP CONSTRAINT calendar_exports_target_check;
ALTER TABLE calendar_exports ADD CONSTRAINT calendar_exports_target_check CHECK (num_nonnulls(schedule_id, recurring_schedule_id) = 1);
ALTER TABLE calendar_exports DROP COLUMN deleted_schedule_id;

ALTER TABLE external_event_links DROP CONSTRAINT external_event_links_target_check;
ALTER TABLE external_event_links ADD CONSTRAINT external_event_links_target_check CHECK (num_nonnulls(schedule_id, recurring_schedule_id) = 1);
ALTER TABLE external_event_links DROP COLUMN deleted_schedule_id;

DROP TABLE schedule_deletions;
