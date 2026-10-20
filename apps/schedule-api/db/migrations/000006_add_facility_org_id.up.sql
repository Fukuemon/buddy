-- 既存の事業所は組織を結び付けるまで NULL にし、前のバージョンのアプリが動いたまま当てられるようにする。
ALTER TABLE facilities
    ADD COLUMN org_id VARCHAR(255) NULL AFTER name,
    ADD UNIQUE KEY uq_facilities_org_id (org_id);
