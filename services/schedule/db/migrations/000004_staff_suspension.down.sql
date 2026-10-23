ALTER TABLE users DROP COLUMN suspended_at;

COMMENT ON COLUMN users.sub IS 'ブローカーの subject。初回のログインまで NULL';
