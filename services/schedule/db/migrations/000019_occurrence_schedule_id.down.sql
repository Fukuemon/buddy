DROP INDEX calendar_event_projections_detached_occurrence_id_idx;
DROP FUNCTION detached_occurrence_schedule_id(text, text, timestamptz, date);
DROP INDEX calendar_event_projections_occurrence_id_idx;
DROP FUNCTION occurrence_schedule_id(text, text, timestamptz, date);
