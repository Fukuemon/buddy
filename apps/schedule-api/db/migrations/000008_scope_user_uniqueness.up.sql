-- 名前は職員の表示名で、同じ名前の職員がいてよい。メールは事業所の中でだけ一意にする。
-- 初回のログインの結び付け（LinkUserSub）は事業所とメールで探すので、この一意で当たる職員は 1 人に限られる。
ALTER TABLE users
    DROP INDEX uq_users_username,
    DROP INDEX uq_users_email,
    ADD UNIQUE KEY uq_users_facility_email (facility_id, email);
