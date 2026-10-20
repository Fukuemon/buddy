-- up の後は、同じ名前の職員と、別の事業所の同じメールを登録できる。
-- 全体の一意のキーを戻すとそのデータで down が止まるので、同じ名前の一意でない索引に戻す。
-- 名前を残すのは、もう一度 up するときに DROP INDEX が当たるようにするため。
ALTER TABLE users
    DROP INDEX uq_users_facility_email,
    ADD INDEX uq_users_username (username),
    ADD INDEX uq_users_email (email);
