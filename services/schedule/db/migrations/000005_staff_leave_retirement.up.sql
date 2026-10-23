-- 職員の停止を、戻せる休職と戻せない退職に分ける（ADR-0018）。止めてある職員は休職として移す。
-- 休職は始めた時刻と、戻る予定の日のメモを持つ。戻る予定の日に自動では戻さない。
-- 退職は、名前、所属、役職を残し、メールと電話番号を消す。同じメールで新しい職員として登録し直せる。

ALTER TABLE users RENAME COLUMN suspended_at TO leave_started_at;

ALTER TABLE users
    ADD COLUMN leave_return_date date NULL,
    ADD COLUMN retired_at timestamptz NULL,
    ALTER COLUMN email DROP NOT NULL,
    ADD CONSTRAINT users_leave_return_date_check CHECK (leave_return_date IS NULL OR leave_started_at IS NOT NULL),
    ADD CONSTRAINT users_retired_check CHECK (
        retired_at IS NULL OR (leave_started_at IS NULL AND phone_number IS NULL)
    ),
    ADD CONSTRAINT users_retired_email_check CHECK ((retired_at IS NULL) = (email IS NOT NULL));

COMMENT ON COLUMN users.email IS '小文字にそろえた値。事業所の中で一意。退職した職員では NULL';
COMMENT ON COLUMN users.leave_started_at IS '職員を休職にした時刻。休職でなければ NULL';
COMMENT ON COLUMN users.leave_return_date IS '休職から戻る予定の日のメモ。この日に自動では戻さない';
COMMENT ON COLUMN users.retired_at IS '職員を退職にした時刻。退職していなければ NULL';
