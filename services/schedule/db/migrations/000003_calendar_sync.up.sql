-- Google カレンダーとの双方向の同期（ADR-0028 の同期）の列。
-- 前のバージョンのアプリが動いたまま当てられるよう、列は既定値を持たせて足す。

ALTER TABLE calendar_sync_states ADD COLUMN next_sync_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE calendar_sync_states ADD COLUMN locked_until timestamptz NULL;
-- 000002 と同じく、検査の制約は NOT VALID で足してから確認する。
ALTER TABLE calendar_sync_states ADD CONSTRAINT calendar_sync_states_last_error_check
    CHECK (last_error IN ('unreadable', 'unavailable', 'apply')) NOT VALID;
ALTER TABLE calendar_sync_states VALIDATE CONSTRAINT calendar_sync_states_last_error_check;
CREATE INDEX calendar_sync_states_due_idx ON calendar_sync_states (next_sync_at, external_calendar_id);

-- Google カレンダーの変更を buddy の予定に読み替えられないときの理由を足す。
ALTER TABLE calendar_exports DROP CONSTRAINT calendar_exports_error_code_check;
ALTER TABLE calendar_exports ADD CONSTRAINT calendar_exports_error_code_check
    CHECK (error_code IN ('precondition_failed', 'not_found', 'forbidden', 'rejected', 'unavailable', 'unappliable')) NOT VALID;
ALTER TABLE calendar_exports VALIDATE CONSTRAINT calendar_exports_error_code_check;

COMMENT ON COLUMN calendar_sync_states.next_sync_at IS 'この時刻より後に、外部のカレンダーの変わった予定を読む';
COMMENT ON COLUMN calendar_sync_states.locked_until IS '読んでいる処理が持つ期限。過ぎたら、ほかの処理が読んでよい';
COMMENT ON COLUMN calendar_sync_states.last_error IS '最後の失敗の理由。unreadable（共有が無い）、unavailable（届かない）、apply（予定を当てられない）。外部の予定の題名とカレンダーの ID を含めない';
COMMENT ON COLUMN calendar_exports.error_code IS '最後に書けなかった理由。外部の予定の題名とカレンダーの ID を含めない。unappliable は、外部の変更を buddy の予定に読み替えられなかったこと';
