-- ブローカーが持つ職員の身元のテーブルを作る（ADR-0017）。名前、役職、権限などの業務のデータは予定の API が持ち、ここには置かない。
-- 職員の ID は、ブローカーが発行する ULID の文字列で、予定の API の users.sub に入る。
-- 事業所は、上流の IdP の設定のファイルと同じ組織の ID で指す。事業所のテーブルは持たない。

CREATE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

CREATE TABLE staff (
    id         text COLLATE "C" NOT NULL CHECK (id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
    org_id     varchar(255)     NOT NULL CHECK (org_id <> ''),
    email      varchar(320)     NOT NULL,
    status     text             NOT NULL DEFAULT 'active',
    created_at timestamptz      NOT NULL DEFAULT now(),
    updated_at timestamptz      NOT NULL DEFAULT now(),
    CONSTRAINT staff_pkey PRIMARY KEY (id),
    CONSTRAINT staff_org_email_key UNIQUE (org_id, email),
    CONSTRAINT staff_email_lower_check CHECK (email = lower(email)),
    CONSTRAINT staff_status_check CHECK (status IN ('active', 'suspended'))
);

CREATE TRIGGER staff_set_updated_at BEFORE UPDATE ON staff
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 1 人の職員は、上流のアカウントを 1 つだけ持つ。結び付けは初回のログインで、上流のメールが確認済みで登録のメールと同じときだけ行う。
CREATE TABLE upstream_accounts (
    staff_id   text COLLATE "C" NOT NULL,
    iss        text             NOT NULL CHECK (iss <> ''),
    sub        text             NOT NULL CHECK (sub <> ''),
    created_at timestamptz      NOT NULL DEFAULT now(),
    CONSTRAINT upstream_accounts_pkey PRIMARY KEY (staff_id),
    CONSTRAINT upstream_accounts_iss_sub_key UNIQUE (iss, sub),
    CONSTRAINT upstream_accounts_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES staff (id) ON DELETE CASCADE
);

COMMENT ON TABLE staff IS 'ブローカーが身元を持つ職員。予定の API の users.sub がこの ID を指す';
COMMENT ON COLUMN staff.org_id IS '所属の事業所の組織の ID。上流の IdP の設定のファイルの org_id と同じ値';
COMMENT ON COLUMN staff.email IS '小文字にそろえた値。事業所の中で一意';
COMMENT ON COLUMN staff.status IS 'active は有効、suspended は停止。停止した職員にはトークンを出さない';
COMMENT ON TABLE upstream_accounts IS '職員に結び付けた上流の IdP のアカウント';
COMMENT ON COLUMN upstream_accounts.iss IS '上流の IdP の ID token の iss';
COMMENT ON COLUMN upstream_accounts.sub IS '上流の IdP の ID token の sub。iss と組で一意';
