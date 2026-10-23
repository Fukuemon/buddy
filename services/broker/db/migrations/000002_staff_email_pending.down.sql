-- 登録の途中の職員は、ログインさせないよう止めた職員に替えてから、状態の制約を戻す。
UPDATE staff SET status = 'suspended' WHERE status = 'pending';

ALTER TABLE staff
    DROP CONSTRAINT staff_status_check,
    ADD CONSTRAINT staff_status_check CHECK (status IN ('active', 'suspended')),
    DROP CONSTRAINT staff_email_key,
    ADD CONSTRAINT staff_org_email_key UNIQUE (org_id, email);

COMMENT ON COLUMN staff.email IS '小文字にそろえた値。事業所の中で一意';
COMMENT ON COLUMN staff.status IS 'active は有効、suspended は停止。停止した職員にはトークンを出さない';
