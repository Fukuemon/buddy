-- 利用者に、戻せる利用の終了を足す（ADR-0017）。利用の終了でも、利用者のレコードを消さず、名前、サービス、担当の職員を残す。
ALTER TABLE patients ADD COLUMN ended_at timestamptz NULL;

COMMENT ON COLUMN patients.ended_at IS '利用者を利用の終了にした時刻。利用中なら NULL';
