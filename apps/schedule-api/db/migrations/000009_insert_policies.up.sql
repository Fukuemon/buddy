-- 権限は全ての環境で同じ 7 行で、認可は code で読む。事業所ごとには持たない。
-- code の無い行（000009 より前にシードと API が作った行）は認可に使えないので、職員と役職への割り当てごと消す。
-- schedule-api はまだリリースしていないので、消して困る環境は無い。
ALTER TABLE policies
    ADD COLUMN code VARCHAR(64) NULL AFTER id,
    ADD COLUMN needs_target BOOLEAN NOT NULL DEFAULT FALSE AFTER name;

DELETE FROM user_policies WHERE policy_id IN (SELECT id FROM (SELECT id FROM policies WHERE code IS NULL) AS old);
DELETE FROM position_policies WHERE policy_id IN (SELECT id FROM (SELECT id FROM policies WHERE code IS NULL) AS old);
DELETE FROM policies WHERE code IS NULL;

ALTER TABLE policies
    MODIFY COLUMN code VARCHAR(64) NOT NULL,
    ADD UNIQUE KEY uq_policies_code (code);

INSERT INTO policies (id, code, name, needs_target) VALUES
    ('01M5E1S42TTS7QZK05YGS0GYR8', 'schedule.self.edit', '自分の予定の編集', FALSE),
    ('01M5E1S42TTS7QZK05YGS0GYR9', 'schedule.user.read', '指定した職員の予定の閲覧', TRUE),
    ('01M5E1S42TTS7QZK05YGS0GYRA', 'schedule.user.edit', '指定した職員の予定の編集', TRUE),
    ('01M5E1S42TTS7QZK05YGS0GYRB', 'schedule.team.read', '指定したチームの職員の予定の閲覧', TRUE),
    ('01M5E1S42TTS7QZK05YGS0GYRC', 'schedule.team.edit', '指定したチームの職員の予定の編集', TRUE),
    ('01M5E1S42TTS7QZK05YGS0GYRD', 'schedule.all.read', '事業所の全ての予定の閲覧', FALSE),
    ('01M5E1S42TTS7QZK05YGS0GYRE', 'schedule.all.edit', '事業所の全ての予定の編集', FALSE);

-- 対象は職員かチームのどちらか 1 つである。上の DELETE で対象の行は残っていないので、表を作り直す。
-- 対象の列の外部キーに ON DELETE CASCADE を付けると CHECK に使えないので、職員とチームの削除は対象の行が止める。
DROP TABLE user_policy_targets;

CREATE TABLE user_policy_targets (
    id             CHAR(26) NOT NULL,
    user_policy_id CHAR(26) NOT NULL,
    target_user_id CHAR(26) NULL,
    target_team_id CHAR(26) NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_user_policy_targets_user (user_policy_id, target_user_id),
    UNIQUE KEY uq_user_policy_targets_team (user_policy_id, target_team_id),
    CONSTRAINT fk_user_policy_targets_user_policy FOREIGN KEY (user_policy_id) REFERENCES user_policies (id) ON DELETE CASCADE,
    CONSTRAINT fk_user_policy_targets_user FOREIGN KEY (target_user_id) REFERENCES users (id),
    CONSTRAINT fk_user_policy_targets_team FOREIGN KEY (target_team_id) REFERENCES teams (id),
    CONSTRAINT chk_user_policy_targets_one CHECK ((target_user_id IS NULL) <> (target_team_id IS NULL))
);
