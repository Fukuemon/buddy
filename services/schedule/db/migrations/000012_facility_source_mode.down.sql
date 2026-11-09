-- not_buddy_primary の待ちは、前の制約に合わないので、書き出しの失敗として残す。
UPDATE calendar_exports SET error_code = 'rejected' WHERE error_code = 'not_buddy_primary';
ALTER TABLE calendar_exports DROP CONSTRAINT calendar_exports_error_code_check;
ALTER TABLE calendar_exports ADD CONSTRAINT calendar_exports_error_code_check
    CHECK (error_code IN ('precondition_failed', 'not_found', 'forbidden', 'rejected', 'unavailable', 'unappliable'));
COMMENT ON COLUMN calendar_exports.error_code IS '最後に書けなかった理由。外部の予定の題名とカレンダーの ID を含めない。unappliable は、外部の変更を buddy の予定に読み替えられなかったこと';

ALTER TABLE facilities DROP COLUMN source_mode;
