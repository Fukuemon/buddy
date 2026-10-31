-- 事務の役職は消さずに残す。up は同じ名前の役職が既にある事業所に足さず、役職の名前は変えられるので、
-- このマイグレーションが足した役職を名前で見分けられないためである。照合の権限だけを消す。
DELETE FROM user_policies WHERE policy_id = '01M69C7BNKSXX7PPWX7SWZGFWK';
DELETE FROM position_policies WHERE policy_id = '01M69C7BNKSXX7PPWX7SWZGFWK';
DELETE FROM policies WHERE id = '01M69C7BNKSXX7PPWX7SWZGFWK';
