-- unappliable の待ちは、前の制約に合わないので、書き出しの失敗として残す。
UPDATE calendar_exports SET error_code = 'rejected' WHERE error_code = 'unappliable';
ALTER TABLE calendar_exports DROP CONSTRAINT calendar_exports_error_code_check;
ALTER TABLE calendar_exports ADD CONSTRAINT calendar_exports_error_code_check
    CHECK (error_code IN ('precondition_failed', 'not_found', 'forbidden', 'rejected', 'unavailable'));
COMMENT ON COLUMN calendar_exports.error_code IS '最後に書けなかった理由。外部の予定の題名とカレンダーの ID を含めない';

DROP INDEX calendar_sync_states_due_idx;
ALTER TABLE calendar_sync_states DROP CONSTRAINT calendar_sync_states_last_error_check;
ALTER TABLE calendar_sync_states DROP COLUMN locked_until;
ALTER TABLE calendar_sync_states DROP COLUMN next_sync_at;
COMMENT ON COLUMN calendar_sync_states.last_error IS '最後の失敗の理由。外部の予定の題名を含めない';
