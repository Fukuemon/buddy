-- 退職した職員は、メールを持たないので、ID から作った宛先の無いメールを入れて止めた職員に戻す。
UPDATE users
SET leave_started_at = retired_at, email = 'retired-' || lower(id) || '@example.invalid'
WHERE retired_at IS NOT NULL;

ALTER TABLE users
    DROP CONSTRAINT users_retired_email_check,
    DROP CONSTRAINT users_retired_check,
    DROP CONSTRAINT users_leave_return_date_check,
    ALTER COLUMN email SET NOT NULL,
    DROP COLUMN retired_at,
    DROP COLUMN leave_return_date;

ALTER TABLE users RENAME COLUMN leave_started_at TO suspended_at;

COMMENT ON COLUMN users.email IS '小文字にそろえた値。事業所の中で一意';
COMMENT ON COLUMN users.suspended_at IS '職員を止めた時刻。止めていなければ NULL';
