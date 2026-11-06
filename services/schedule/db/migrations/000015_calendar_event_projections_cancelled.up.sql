-- Projection を書くのは、同期と予定の API の書き込みの 2 つで、書く順は決まらない（ADR-0026）。
-- Google で取り消した単発の予定と親の予定の行も、取り消しの状態と Google の更新の時刻を持つ行に残す。
-- 行を消すと、予定の API が古い応答で予定を戻すためである。
ALTER TABLE calendar_event_projections DROP CONSTRAINT calendar_event_projections_cancelled_check;

COMMENT ON COLUMN calendar_event_projections.status IS 'confirmed、cancelled。cancelled は Google で取り消した予定で、単発の予定と親の予定も行に残す。予定の表示の読み出しは返さない';
COMMENT ON COLUMN calendar_event_projections.google_updated_at IS 'Google で予定を最後に変えた時刻。行を書き直すのは、書く予定の時刻がこの時刻より新しいときだけにする';
COMMENT ON COLUMN calendar_event_projections.last_end_date IS 'Asia/Tokyo で予定が終わる日。繰り返しは最後の回、取り消した回は元の開始の日、取り消した単発の予定と親の予定は取り消しを写した日。終わりの無い繰り返しと、最後の回を決められない繰り返しは NULL。保持する期間より前に終わった行を消すのに使う';
