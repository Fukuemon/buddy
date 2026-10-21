-- ADR-0006 の職員の管理の権限を入れる。職員の権限と役職を変える操作は、この権限を持つ職員だけに許す。
INSERT INTO policies (id, code, name, needs_target) VALUES
    ('01M5E5GP6Q8BQYNWN66QHJF60J', 'staff.manage', '職員の管理', FALSE);

-- 既にある環境で誰も職員を管理できなくならないよう、事業所の全ての予定の編集（schedule.all.edit）を目印に、役職の既定と職員の権限に足す。
-- PRD の既定ではマネージャーだけが持つが、管理者がそれを既定に入れた独自の役職とその職員にも付く。役職の名前は事業所ごとに違うので使わない。
INSERT INTO position_policies (position_id, policy_id)
SELECT pp.position_id, '01M5E5GP6Q8BQYNWN66QHJF60J'
FROM position_policies pp
JOIN policies p ON p.id = pp.policy_id
WHERE p.code = 'schedule.all.edit';

-- user_policies の ID は SQL で ULID を作れないので、目印の権限の行の ID の時刻の部分を、この権限の行の ID の時刻の部分に置き換えて作る。
-- 元の ID が一意なので、作る ID の間では重ならない。既にある行と重なるのは、ランダムの部分まで一致する ID を手で作った場合に限る。
INSERT INTO user_policies (id, user_id, policy_id)
SELECT CONCAT('01M5E5GP6Q', SUBSTRING(up.id, 11)), up.user_id, '01M5E5GP6Q8BQYNWN66QHJF60J'
FROM user_policies up
JOIN policies p ON p.id = up.policy_id
WHERE p.code = 'schedule.all.edit';
