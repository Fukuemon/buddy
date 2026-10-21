-- 000002 の形の表は職員の対象しか持てないので、対象の行は戻さない。
-- 権限の行は職員と役職から参照されるので、000007 と同じく戻しても残す。
DROP TABLE user_policy_targets;

CREATE TABLE user_policy_targets (
    user_policy_id CHAR(26) NOT NULL,
    target_user_id CHAR(26) NOT NULL,
    PRIMARY KEY (user_policy_id, target_user_id),
    CONSTRAINT fk_user_policy_targets_user_policy FOREIGN KEY (user_policy_id) REFERENCES user_policies (id) ON DELETE CASCADE,
    CONSTRAINT fk_user_policy_targets_target FOREIGN KEY (target_user_id) REFERENCES users (id) ON DELETE CASCADE
);

ALTER TABLE policies
    DROP INDEX uq_policies_code,
    DROP COLUMN needs_target,
    DROP COLUMN code;
