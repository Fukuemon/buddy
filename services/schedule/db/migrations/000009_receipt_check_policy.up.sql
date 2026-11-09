-- 照合の権限と、事務の役職を足す（ADR-0007）。
-- 今は全ての職員が照合を使えるので、職員の管理の権限を持つ今いる職員にも照合の権限を足し、デプロイの直後に照合できる職員を残す（#376）。

INSERT INTO policies (id, code, name, needs_target) VALUES
    ('01M69C7BNKSXX7PPWX7SWZGFWK', 'receipt.check', '照合', false);

-- 役職の名前は事業所ごとに変えてよいので、職員の管理の権限をデフォルトに持つ役職をマネージャーとみなす。
INSERT INTO position_policies (position_id, policy_id)
SELECT pp.position_id, '01M69C7BNKSXX7PPWX7SWZGFWK'
FROM position_policies pp
JOIN policies p ON p.id = pp.policy_id
WHERE p.code = 'staff.manage';

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

WITH added AS (
    INSERT INTO positions (id, facility_id, name)
    SELECT pg_temp.new_ulid(), f.id, '事務'
    FROM facilities f
    ON CONFLICT (facility_id, name) DO NOTHING
    RETURNING id
)
INSERT INTO position_policies (position_id, policy_id)
SELECT a.id, p.id
FROM added a
CROSS JOIN policies p
WHERE p.code IN ('schedule.all.read', 'schedule.all.edit');

-- 照合の権限は、足した役職ではなく事務という名前の役職の全てに足す。
-- 戻すと事務の役職が残るので、戻した後に流し直すと、上の added に入らないためである。
INSERT INTO position_policies (position_id, policy_id)
SELECT ps.id, '01M69C7BNKSXX7PPWX7SWZGFWK'
FROM positions ps
WHERE ps.name = '事務'
ON CONFLICT (position_id, policy_id) DO NOTHING;

INSERT INTO user_policies (id, facility_id, user_id, policy_id)
SELECT pg_temp.new_ulid(), u.facility_id, u.id, '01M69C7BNKSXX7PPWX7SWZGFWK'
FROM users u
WHERE u.retired_at IS NULL
  AND EXISTS (
      SELECT 1 FROM user_policies up
      JOIN policies p ON p.id = up.policy_id
      WHERE up.user_id = u.id AND p.code = 'staff.manage'
  )
ON CONFLICT (user_id, policy_id) DO NOTHING;

DROP FUNCTION pg_temp.new_ulid();
