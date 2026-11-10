-- 権限の変更の監査の記録（ADR-0042）。権限を変える操作と同じトランザクションで書き、消さず、書き換えない。画面と API に出さない。
-- 職員と利用者の名前とメールは持たない。
CREATE TABLE permission_audits (
    id                 text COLLATE "C" NOT NULL CHECK (id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
    facility_id        text COLLATE "C" NOT NULL,
    action             text             NOT NULL,
    actor_kind         text             NOT NULL,
    actor_user_id      text COLLATE "C" NULL,
    actor_operator     text             NULL,
    target_user_id     text COLLATE "C" NULL,
    target_position_id text COLLATE "C" NULL,
    before             jsonb            NULL,
    after              jsonb            NULL,
    request_id         text COLLATE "C" NOT NULL CHECK (char_length(request_id) BETWEEN 1 AND 255),
    occurred_at        timestamptz      NOT NULL DEFAULT now(),
    CONSTRAINT permission_audits_pkey PRIMARY KEY (id),
    CONSTRAINT permission_audits_action_check CHECK (action IN (
        'facility.create', 'position.create', 'staff.create', 'staff.create_forced',
        'grant.add', 'grant.remove', 'position.change', 'team.change', 'grant.migrate')),
    -- 操作した人は、職員なら actor_user_id だけを、運営者なら actor_operator だけを持つ。
    CONSTRAINT permission_audits_actor_check CHECK (
        (actor_kind = 'staff' AND actor_user_id IS NOT NULL AND actor_operator IS NULL)
        OR (actor_kind = 'operator' AND actor_user_id IS NULL AND actor_operator IS NOT NULL)),
    CONSTRAINT permission_audits_actor_operator_check CHECK (char_length(actor_operator) BETWEEN 1 AND 255),
    -- 運営者だけの操作と、職員だけの操作。position.create と staff.create は、職員と運営者のどちらもする。
    CONSTRAINT permission_audits_action_actor_check CHECK (
        (action NOT IN ('facility.create', 'staff.create_forced', 'grant.migrate') OR actor_kind = 'operator')
        AND (action NOT IN ('grant.add', 'grant.remove', 'position.change', 'team.change') OR actor_kind = 'staff')),
    -- 対象と変更の前後は、操作ごとに決まる。事業所の登録は持たず、登録と役職の作成は変更の前を持たない。
    -- grant.migrate の変更の前は、監査のテーブルを作るマイグレーションの始まりの行だけが持たない。
    CONSTRAINT permission_audits_target_check CHECK (CASE
        WHEN action = 'facility.create' THEN
            num_nonnulls(target_user_id, target_position_id, before, after) = 0
        WHEN action = 'position.create' THEN
            target_user_id IS NULL AND target_position_id IS NOT NULL AND before IS NULL AND after IS NOT NULL
        WHEN action IN ('staff.create', 'staff.create_forced') THEN
            target_user_id IS NOT NULL AND target_position_id IS NULL AND before IS NULL AND after IS NOT NULL
        WHEN action = 'grant.migrate' THEN
            target_user_id IS NOT NULL AND target_position_id IS NULL AND after IS NOT NULL
        ELSE
            target_user_id IS NOT NULL AND target_position_id IS NULL AND before IS NOT NULL AND after IS NOT NULL
        END),
    CONSTRAINT permission_audits_facility_fkey FOREIGN KEY (facility_id) REFERENCES facilities (id),
    CONSTRAINT permission_audits_actor_user_fkey FOREIGN KEY (facility_id, actor_user_id) REFERENCES users (facility_id, id),
    CONSTRAINT permission_audits_target_user_fkey FOREIGN KEY (facility_id, target_user_id) REFERENCES users (facility_id, id),
    CONSTRAINT permission_audits_target_position_fkey FOREIGN KEY (facility_id, target_position_id) REFERENCES positions (facility_id, id)
);
CREATE INDEX permission_audits_actor_user_idx ON permission_audits (facility_id, actor_user_id) WHERE actor_user_id IS NOT NULL;
CREATE INDEX permission_audits_target_user_idx ON permission_audits (facility_id, target_user_id) WHERE target_user_id IS NOT NULL;
CREATE INDEX permission_audits_target_position_idx ON permission_audits (facility_id, target_position_id) WHERE target_position_id IS NOT NULL;
CREATE INDEX permission_audits_request_idx ON permission_audits (request_id);

COMMENT ON TABLE permission_audits IS '権限の変更と運営者の登録の監査の記録（ADR-0042）。画面と API に出さず、運営者が DB で読む。消さず、書き換えない';
COMMENT ON COLUMN permission_audits.action IS '操作。facility.create、position.create、staff.create、staff.create_forced、grant.add、grant.remove、position.change、team.change、grant.migrate';
COMMENT ON COLUMN permission_audits.actor_kind IS '操作した人の種類。staff か operator。マイグレーションは operator';
COMMENT ON COLUMN permission_audits.actor_user_id IS '操作した職員。actor_kind が staff のときだけ持つ';
COMMENT ON COLUMN permission_audits.actor_operator IS '操作した運営者。運営用の CLI の引数 --operator で渡した運営者の ID か、マイグレーションの migration:<番号>。actor_kind が operator のときだけ持つ';
COMMENT ON COLUMN permission_audits.target_user_id IS '対象の職員。staff.*、grant.*、position.change、team.change で持つ';
COMMENT ON COLUMN permission_audits.target_position_id IS '対象の役職。position.create で持つ';
COMMENT ON COLUMN permission_audits.before IS '変更の前の全量。職員は役職とチームの ID と権限の code と対象の ID の並び。登録と役職の作成と、始まりの行では持たない';
COMMENT ON COLUMN permission_audits.after IS '変更の後の全量。職員は役職とチームの ID と権限の code と対象の ID の並び、役職の作成は名前とデフォルトの権限の code の並び';
COMMENT ON COLUMN permission_audits.request_id IS '相関 ID。API はリクエストごと、CLI は実行ごと、マイグレーションは 1 つのマイグレーションごとに振り、ログにも同じ値を書く';
COMMENT ON COLUMN permission_audits.occurred_at IS '操作の時刻';

-- 記録の始まりとして、今いる全ての職員の権限を 1 人 1 行ずつ書き、1 つの相関 ID でつなぐ（ADR-0042 の残す操作）。
-- after の形は、予定の API が書く記録（internal/audit の StaffState）と同じにする。
CREATE FUNCTION pg_temp.new_ulid() RETURNS text LANGUAGE plpgsql AS $$
DECLARE
    alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
    ms bigint := floor(extract(epoch FROM clock_timestamp()) * 1000);
    id text := '';
BEGIN
    FOR i IN REVERSE 9..0 LOOP
        id := id || substr(alphabet, ((ms >> (5 * i)) & 31)::int + 1, 1);
    END LOOP;
    FOR i IN 1..16 LOOP
        id := id || substr(alphabet, floor(random() * 32)::int + 1, 1);
    END LOOP;
    RETURN id;
END;
$$;

WITH request AS (
    SELECT pg_temp.new_ulid() AS id
),
grants AS (
    SELECT up.user_id, p.code,
           jsonb_build_object('code', p.code)
           || CASE WHEN bool_or(upt.target_user_id IS NOT NULL)
                   THEN jsonb_build_object('target_user_ids', jsonb_agg(upt.target_user_id ORDER BY upt.target_user_id) FILTER (WHERE upt.target_user_id IS NOT NULL))
                   ELSE '{}'::jsonb END
           || CASE WHEN bool_or(upt.target_team_id IS NOT NULL)
                   THEN jsonb_build_object('target_team_ids', jsonb_agg(upt.target_team_id ORDER BY upt.target_team_id) FILTER (WHERE upt.target_team_id IS NOT NULL))
                   ELSE '{}'::jsonb END AS grant_json
    FROM user_policies up
    JOIN policies p ON p.id = up.policy_id
    LEFT JOIN user_policy_targets upt ON upt.user_policy_id = up.id
    GROUP BY up.id, up.user_id, p.code
)
INSERT INTO permission_audits (id, facility_id, action, actor_kind, actor_operator, target_user_id, after, request_id)
SELECT pg_temp.new_ulid(), u.facility_id, 'grant.migrate', 'operator', 'migration:000024', u.id,
       jsonb_build_object(
           'position_id', u.position_id,
           'team_id', u.team_id,
           'grants', COALESCE((SELECT jsonb_agg(g.grant_json ORDER BY g.code COLLATE "C") FROM grants g WHERE g.user_id = u.id), '[]'::jsonb)),
       request.id
FROM users u
CROSS JOIN request;

DROP FUNCTION pg_temp.new_ulid();
