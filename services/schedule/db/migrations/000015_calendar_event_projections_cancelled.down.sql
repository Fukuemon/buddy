-- 取り消した単発の予定と親の予定の行は、前の制約に合わないので消す。
DELETE FROM calendar_event_projections WHERE status = 'cancelled' AND recurring_event_id IS NULL;
ALTER TABLE calendar_event_projections
    ADD CONSTRAINT calendar_event_projections_cancelled_check CHECK (status = 'confirmed' OR recurring_event_id IS NOT NULL);

COMMENT ON COLUMN calendar_event_projections.status IS 'confirmed、cancelled。cancelled は繰り返しの予定の取り消した回で、取り消した単発の予定と親の予定は行を消す';
COMMENT ON COLUMN calendar_event_projections.google_updated_at IS 'Google で予定を最後に変えた時刻';
COMMENT ON COLUMN calendar_event_projections.last_end_date IS 'Asia/Tokyo で予定が終わる日。繰り返しは最後の回、取り消した回は元の開始の日。終わりの無い繰り返しと、最後の回を決められない繰り返しは NULL。保持する期間より前に終わった行を消すのに使う';
