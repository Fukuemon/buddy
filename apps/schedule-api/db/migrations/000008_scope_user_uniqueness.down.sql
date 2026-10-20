-- up の後は、同じ名前の職員と、別の事業所の同じメールを登録できる。
-- 全体の一意のキーを戻すとそのデータで down が止まるので、名前は一意でない索引に、メールは事業所ごとの一意のまま戻す。
-- up の DROP INDEX が当たるよう、索引の名前は 000002 のものにそろえる。
ALTER TABLE users
    DROP INDEX uq_users_facility_email,
    ADD INDEX uq_users_username (username),
    ADD UNIQUE KEY uq_users_email (facility_id, email);
