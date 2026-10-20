-- 同じ名前の職員か、別の事業所に同じメールの職員がいると、一意のキーを作れずに失敗する。
ALTER TABLE users
    DROP INDEX uq_users_facility_email,
    ADD UNIQUE KEY uq_users_username (username),
    ADD UNIQUE KEY uq_users_email (email);
