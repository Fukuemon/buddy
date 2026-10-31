-- 照合の権限と、事務の役職を足す（ADR-0022）。
-- 役職のデフォルトの権限だけを変え、今いる職員の権限は変えない。照合を続ける職員には、職員の管理の権限を持つ職員が照合の権限を足す。

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
WHERE p.code IN ('schedule.all.read', 'schedule.all.edit', 'receipt.check');

DROP FUNCTION pg_temp.new_ulid();
