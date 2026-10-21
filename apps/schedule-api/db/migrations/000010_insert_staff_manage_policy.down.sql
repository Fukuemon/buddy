-- 戻すと職員の管理の権限が無くなるので、職員と役職への割り当てごと消す。
DELETE FROM user_policies WHERE policy_id = '01M5E5GP6Q8BQYNWN66QHJF60J';
DELETE FROM position_policies WHERE policy_id = '01M5E5GP6Q8BQYNWN66QHJF60J';
DELETE FROM policies WHERE id = '01M5E5GP6Q8BQYNWN66QHJF60J';
