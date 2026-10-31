-- 職員の付く事務の役職は、職員の役職を外せないので残す。
DELETE FROM positions ps
WHERE ps.name = '事務'
  AND NOT EXISTS (SELECT 1 FROM users u WHERE u.position_id = ps.id);

DELETE FROM user_policies WHERE policy_id = '01M69C7BNKSXX7PPWX7SWZGFWK';
DELETE FROM position_policies WHERE policy_id = '01M69C7BNKSXX7PPWX7SWZGFWK';
DELETE FROM policies WHERE id = '01M69C7BNKSXX7PPWX7SWZGFWK';
