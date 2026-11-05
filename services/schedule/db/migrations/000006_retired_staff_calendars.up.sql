-- 退職した職員の外部のカレンダーを外す（ADR-0001）。退職は、職員を退職にするトランザクションでカレンダーを外す。
-- 退職でカレンダーを外すようにする前に退職にした職員のカレンダーを、ここで外す。カレンダーのレコードと予定の対応は残す。
UPDATE external_calendars
SET disabled_at = now()
WHERE disabled_at IS NULL
  AND staff_id IN (SELECT id FROM users WHERE retired_at IS NOT NULL);
