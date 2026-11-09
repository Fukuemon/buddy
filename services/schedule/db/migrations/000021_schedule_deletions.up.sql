-- 誤って入れた予定の削除（ADR-0040）。削除した予定の行は監査の記録に移してから消し、削除済みの印を付けて残さない。
-- 監査の記録は、操作した職員、時刻、消した予定の ID、日付、予定の職員だけを持ち、訪問の情報と利用者を持たない。
CREATE TABLE schedule_deletions (
    id                    text COLLATE "C" NOT NULL CHECK (id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
    facility_id           text COLLATE "C" NOT NULL,
    schedule_id           text COLLATE "C" NULL,
    recurring_schedule_id text COLLATE "C" NULL,
    date                  date             NOT NULL,
    staff_id              text COLLATE "C" NOT NULL,
    deleted_by            text COLLATE "C" NOT NULL,
    deleted_at            timestamptz      NOT NULL DEFAULT now(),
    CONSTRAINT schedule_deletions_pkey PRIMARY KEY (id),
    CONSTRAINT schedule_deletions_schedule_key UNIQUE (facility_id, schedule_id),
    CONSTRAINT schedule_deletions_occurrence_key UNIQUE (recurring_schedule_id, date),
    CONSTRAINT schedule_deletions_target_check CHECK (num_nonnulls(schedule_id, recurring_schedule_id) = 1),
    CONSTRAINT schedule_deletions_facility_fkey FOREIGN KEY (facility_id) REFERENCES facilities (id),
    CONSTRAINT schedule_deletions_recurring_schedule_fkey FOREIGN KEY (facility_id, recurring_schedule_id) REFERENCES recurring_schedules (facility_id, id),
    CONSTRAINT schedule_deletions_staff_fkey FOREIGN KEY (facility_id, staff_id) REFERENCES users (facility_id, id),
    CONSTRAINT schedule_deletions_deleted_by_fkey FOREIGN KEY (facility_id, deleted_by) REFERENCES users (facility_id, id)
);
CREATE INDEX schedule_deletions_staff_idx ON schedule_deletions (facility_id, staff_id);
CREATE INDEX schedule_deletions_deleted_by_idx ON schedule_deletions (facility_id, deleted_by);

COMMENT ON TABLE schedule_deletions IS '誤って入れた予定を削除した監査の記録（ADR-0040）。画面に出さない。消した時点の内容（訪問の情報と利用者）は持たない';
COMMENT ON COLUMN schedule_deletions.schedule_id IS '削除した単発の予定の ID。回の削除では NULL';
COMMENT ON COLUMN schedule_deletions.recurring_schedule_id IS '回を削除した繰り返しの予定。単発の予定の削除では NULL';
COMMENT ON COLUMN schedule_deletions.date IS '単発の予定の開始の日か、削除した回の日';
COMMENT ON COLUMN schedule_deletions.staff_id IS '削除した予定の職員';
COMMENT ON COLUMN schedule_deletions.deleted_by IS '削除した職員';
COMMENT ON COLUMN schedule_deletions.deleted_at IS '削除した時刻';

-- 予定の行を消すと、予定の対応と書き出しの待ちは ON DELETE CASCADE で消える。書き出しが Google に削除を書くまで予定の対応を残すため、
-- 削除した単発の予定の対応と待ちは、予定の代わりに監査の記録を指す。
ALTER TABLE external_event_links ADD COLUMN deleted_schedule_id text COLLATE "C" NULL;
ALTER TABLE external_event_links ADD CONSTRAINT external_event_links_deleted_schedule_fkey
    FOREIGN KEY (facility_id, deleted_schedule_id) REFERENCES schedule_deletions (facility_id, schedule_id);
ALTER TABLE external_event_links ADD CONSTRAINT external_event_links_deleted_schedule_key UNIQUE (deleted_schedule_id);
ALTER TABLE external_event_links DROP CONSTRAINT external_event_links_target_check;
ALTER TABLE external_event_links ADD CONSTRAINT external_event_links_target_check
    CHECK (num_nonnulls(schedule_id, recurring_schedule_id, deleted_schedule_id) = 1);

ALTER TABLE calendar_exports ADD COLUMN deleted_schedule_id text COLLATE "C" NULL;
ALTER TABLE calendar_exports ADD CONSTRAINT calendar_exports_deleted_schedule_fkey
    FOREIGN KEY (facility_id, deleted_schedule_id) REFERENCES schedule_deletions (facility_id, schedule_id);
ALTER TABLE calendar_exports DROP CONSTRAINT calendar_exports_target_check;
ALTER TABLE calendar_exports ADD CONSTRAINT calendar_exports_target_check
    CHECK (num_nonnulls(schedule_id, recurring_schedule_id, deleted_schedule_id) = 1);
CREATE UNIQUE INDEX calendar_exports_open_deleted_schedule_key ON calendar_exports (deleted_schedule_id) WHERE status <> 'succeeded' AND deleted_schedule_id IS NOT NULL;
CREATE INDEX calendar_exports_facility_deleted_schedule_idx ON calendar_exports (facility_id, deleted_schedule_id) WHERE deleted_schedule_id IS NOT NULL;

COMMENT ON COLUMN external_event_links.deleted_schedule_id IS '削除した単発の予定の ID。書き出しが外部の予定を消すまで対応を残す（ADR-0040）';
COMMENT ON COLUMN calendar_exports.deleted_schedule_id IS '削除した単発の予定の ID。外部の予定を消す待ち（ADR-0040）';
