-- 退職した職員はメールを持たず、戻すとメールの NOT NULL に反するので消す。上流のアカウントは退職で消してある。
DELETE FROM staff WHERE status = 'retired';

ALTER TABLE staff
    DROP CONSTRAINT staff_retired_email_check,
    DROP CONSTRAINT staff_status_check,
    ADD CONSTRAINT staff_status_check CHECK (status IN ('pending', 'active', 'suspended')),
    ALTER COLUMN email SET NOT NULL;

COMMENT ON COLUMN staff.email IS '小文字にそろえた値。全ての事業所で一意';
COMMENT ON COLUMN staff.status IS 'pending は登録の途中、active は有効、suspended は停止。active の職員にだけトークンを出す';
