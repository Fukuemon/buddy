-- 同期が、書く期限を過ぎた保留の版を Google から読み戻す（ADR-0029）。
-- Google の呼び出しをトランザクションの外で行うので、取った記録をほかの Worker に渡さない期限を行に持つ。
ALTER TABLE calendar_event_records ADD COLUMN pending_locked_until timestamptz NULL;
CREATE INDEX calendar_event_records_pending_deadline_idx ON calendar_event_records (pending_deadline) WHERE pending_version IS NOT NULL;

COMMENT ON COLUMN calendar_event_records.pending_locked_until IS '同期が保留の版を読み戻す間、ほかの Worker に記録を渡さない期限。読み戻せなかった記録は、この時刻の後に取り直す。保留の版を解いても NULL に戻さない';
