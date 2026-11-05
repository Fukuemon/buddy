-- 職員に、訪問するかを持たせる（ADR-0014）。今いる職員と、これから登録する職員の初期値は「訪問する」である。
-- 役職からは決めない。訪問しない職員は、予定のカレンダーの職員の列と、予定と担当の候補に出ない。
ALTER TABLE users ADD COLUMN visits boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN users.visits IS '訪問するか。false の職員には、予定と担当を新しく割り振れない';
