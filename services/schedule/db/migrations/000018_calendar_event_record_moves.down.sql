DROP INDEX calendar_event_projections_schedule_id_idx;
DROP FUNCTION projected_schedule_id(text, text);
ALTER TABLE calendar_event_records
    DROP CONSTRAINT calendar_event_records_pending_calendar_fkey,
    DROP CONSTRAINT calendar_event_records_pending_move_check,
    DROP COLUMN pending_external_event_id,
    DROP COLUMN pending_external_calendar_id;
