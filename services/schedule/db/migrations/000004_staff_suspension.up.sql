-- 職員の停止を持つ（ADR-0016）。職員はブローカーでも止め、ブローカーはトークンを出さなくなる。
-- 予定の API は、止めた職員のリクエストを、手元の access token の期限を待たずに 403 で拒む。
-- users.sub は、初回のログインではなく、職員の登録のときにブローカーが発行した職員の ID を入れる。

ALTER TABLE users ADD COLUMN suspended_at timestamptz NULL;

COMMENT ON COLUMN users.sub IS 'ブローカーの職員の ID。登録のときにブローカーが発行する';
COMMENT ON COLUMN users.suspended_at IS '職員を止めた時刻。止めていなければ NULL';
