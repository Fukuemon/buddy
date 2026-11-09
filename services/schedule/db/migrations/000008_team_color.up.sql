-- チームに、デザインシステムのチームの色のトークンの名前を持たせる。今あるチームには、事業所ごとに名前の順で 8 色を先頭から入れ、9 個目からは繰り返す。
ALTER TABLE teams ADD COLUMN color text NULL;

UPDATE teams t
SET color = (ARRAY['blue', 'orange', 'magenta', 'cyan', 'yellow', 'purple', 'green', 'lime'])[(o.n - 1) % 8 + 1]
FROM (SELECT id, row_number() OVER (PARTITION BY facility_id ORDER BY name, id) AS n FROM teams) o
WHERE t.id = o.id;

ALTER TABLE teams
    ALTER COLUMN color SET NOT NULL,
    ADD CONSTRAINT teams_color_check CHECK (color IN ('blue', 'orange', 'magenta', 'cyan', 'yellow', 'purple', 'green', 'lime'));

COMMENT ON COLUMN teams.color IS 'チームの色。packages/ui のチームの色のトークンの名前（team- の後ろ）。事業所の中で重なってよい';
