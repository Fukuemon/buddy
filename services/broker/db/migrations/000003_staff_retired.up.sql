-- 職員の退職を retired で表す（ADR-0017）。退職した職員は、メールと上流のアカウントを消し、ID だけを残す。
-- 同じ人を再び雇うときは、同じメールと同じ上流のアカウントで新しい職員として登録し直せる。
-- suspended は休職で、予定の API の復職で active に戻る。retired は戻さない。

ALTER TABLE staff
    ALTER COLUMN email DROP NOT NULL,
    DROP CONSTRAINT staff_status_check,
    ADD CONSTRAINT staff_status_check CHECK (status IN ('pending', 'active', 'suspended', 'retired')),
    ADD CONSTRAINT staff_retired_email_check CHECK ((status = 'retired') = (email IS NULL));

COMMENT ON COLUMN staff.email IS '小文字にそろえた値。全ての事業所で一意。退職した職員では NULL';
COMMENT ON COLUMN staff.status IS 'pending は登録の途中、active は有効、suspended は休職、retired は退職。active の職員にだけトークンを出す';
