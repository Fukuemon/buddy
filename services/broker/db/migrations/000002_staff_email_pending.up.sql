-- 職員のメールを、全ての事業所で一意にする（ADR-0016 の、1 人の職員は 1 つの事業所に属する）。
-- 事業所の中だけで一意だと、ほかの事業所の管理者が同じメールの職員を登録でき、ログインで事業所を決められなくなる。
-- 登録の途中の職員を pending で表す。予定の API が職員を書き終えてから active にし、pending の職員にはトークンを出さない。

ALTER TABLE staff
    DROP CONSTRAINT staff_org_email_key,
    ADD CONSTRAINT staff_email_key UNIQUE (email),
    DROP CONSTRAINT staff_status_check,
    ADD CONSTRAINT staff_status_check CHECK (status IN ('pending', 'active', 'suspended'));

COMMENT ON COLUMN staff.email IS '小文字にそろえた値。全ての事業所で一意';
COMMENT ON COLUMN staff.status IS 'pending は登録の途中、active は有効、suspended は停止。active の職員にだけトークンを出す';
