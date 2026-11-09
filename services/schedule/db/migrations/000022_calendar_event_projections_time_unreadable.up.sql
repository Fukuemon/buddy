-- Google カレンダーで開始か終了の日時を読めない予定も、Projection の行に残す。予定のカレンダーが、出せない予定の件数に数えるためである（#672）。
-- 読めない予定の行は、読めた方の日時か日付だけを持つ。どちらも読めなければ、開始と終了の両方が NULL である。
ALTER TABLE calendar_event_projections ADD COLUMN time_unreadable boolean NOT NULL DEFAULT false;

ALTER TABLE calendar_event_projections DROP CONSTRAINT calendar_event_projections_start_check;
ALTER TABLE calendar_event_projections DROP CONSTRAINT calendar_event_projections_end_check;
ALTER TABLE calendar_event_projections ADD CONSTRAINT calendar_event_projections_start_check
    CHECK (num_nonnulls(start_at, start_date) <= 1 AND (status = 'cancelled' OR time_unreadable OR num_nonnulls(start_at, start_date) = 1));
ALTER TABLE calendar_event_projections ADD CONSTRAINT calendar_event_projections_end_check
    CHECK (num_nonnulls(end_at, end_date) <= 1 AND (status = 'cancelled' OR time_unreadable OR num_nonnulls(end_at, end_date) = 1));

COMMENT ON COLUMN calendar_event_projections.time_unreadable IS '開始か終了の日時を読めない予定のとき true。読めた方の日時か日付だけを持つ。予定のカレンダーは、出せない予定の件数に数える';
