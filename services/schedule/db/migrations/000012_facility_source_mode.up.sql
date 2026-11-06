-- 事業所に、予定の正本のモードを持たせる（ADR-0028）。今ある事業所は buddy_primary にし、今の動作を変えない。
-- 新しい事業所のデフォルトは google_primary にする。
ALTER TABLE facilities ADD COLUMN source_mode text NOT NULL DEFAULT 'buddy_primary';
ALTER TABLE facilities ALTER COLUMN source_mode SET DEFAULT 'google_primary';
ALTER TABLE facilities ADD CONSTRAINT facilities_source_mode_check CHECK (source_mode IN ('google_primary', 'buddy_primary'));

COMMENT ON COLUMN facilities.source_mode IS '予定の正本のモード。google_primary は Google カレンダーが正本で予定の API から予定を書けない。buddy_primary は buddy が正本で Google カレンダーへ書き出す';

-- 書き出しの処理が、buddy_primary でない事業所の待ちを書かずに保留にした理由を足す。
ALTER TABLE calendar_exports DROP CONSTRAINT calendar_exports_error_code_check;
ALTER TABLE calendar_exports ADD CONSTRAINT calendar_exports_error_code_check
    CHECK (error_code IN ('precondition_failed', 'not_found', 'forbidden', 'rejected', 'unavailable', 'unappliable', 'not_buddy_primary')) NOT VALID;
ALTER TABLE calendar_exports VALIDATE CONSTRAINT calendar_exports_error_code_check;

COMMENT ON COLUMN calendar_exports.error_code IS '最後に書けなかった理由。外部の予定の題名とカレンダーの ID を含めない。unappliable は、外部の変更を buddy の予定に読み替えられなかったこと。not_buddy_primary は、事業所が buddy を正本にしていないので書かなかったこと';
