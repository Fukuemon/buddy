package postgres

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendarwrite"
	"github.com/Fukuemon/buddy/services/schedule/internal/postgres/sqlcgen"
)

// CalendarEventRecordRepository は、calendarwrite.RecordRepository を実装する。
type CalendarEventRecordRepository struct{ conn }

// NewCalendarEventRecordRepository は CalendarEventRecordRepository を作る。
func NewCalendarEventRecordRepository(pool *pgxpool.Pool) *CalendarEventRecordRepository {
	return &CalendarEventRecordRepository{conn{pool}}
}

var _ calendarwrite.RecordRepository = (*CalendarEventRecordRepository)(nil)

// GetForUpdate は、calendarwrite.RecordRepository の GetForUpdate を実装する。行を FOR UPDATE で読む。
func (r *CalendarEventRecordRepository) GetForUpdate(ctx context.Context, scheduleID string) (calendarwrite.Record, error) {
	row, err := r.q(ctx).GetCalendarEventRecordForUpdate(ctx, scheduleID)
	if err != nil {
		return calendarwrite.Record{}, translate("get calendar event record", err)
	}
	rec := calendarwrite.Record{
		ScheduleID: row.ScheduleID, FacilityID: row.FacilityID, ExternalCalendarID: row.ExternalCalendarID, ExternalEventID: row.ExternalEventID,
		VisitInfoID: row.VisitInfoID, Version: int(row.Version),
	}
	if row.PendingVersion != nil && row.PendingState != nil && row.PendingDeadline != nil {
		rec.Pending = &calendarwrite.Pending{
			Version: int(*row.PendingVersion), State: calendarwrite.PendingState(*row.PendingState),
			VisitInfoID: row.PendingVisitInfoID, Deadline: *row.PendingDeadline,
		}
	}
	return rec, nil
}

// Create は、calendarwrite.RecordRepository の Create を実装する。
func (r *CalendarEventRecordRepository) Create(ctx context.Context, rec calendarwrite.Record) error {
	cols, err := recordColumnsOf(rec)
	if err != nil {
		return err
	}
	err = r.q(ctx).CreateCalendarEventRecord(ctx, sqlcgen.CreateCalendarEventRecordParams{
		ScheduleID: rec.ScheduleID, FacilityID: rec.FacilityID, ExternalCalendarID: rec.ExternalCalendarID, ExternalEventID: rec.ExternalEventID,
		VisitInfoID: rec.VisitInfoID, Version: cols.version, PendingVersion: cols.pendingVersion, PendingState: cols.pendingState,
		PendingVisitInfoID: cols.pendingVisitInfoID, PendingDeadline: cols.pendingDeadline,
	})
	return translate("create calendar event record", err)
}

// Update は、calendarwrite.RecordRepository の Update を実装する。
func (r *CalendarEventRecordRepository) Update(ctx context.Context, rec calendarwrite.Record) error {
	cols, err := recordColumnsOf(rec)
	if err != nil {
		return err
	}
	err = r.q(ctx).UpdateCalendarEventRecord(ctx, sqlcgen.UpdateCalendarEventRecordParams{
		ScheduleID: rec.ScheduleID, VisitInfoID: rec.VisitInfoID, Version: cols.version, PendingVersion: cols.pendingVersion,
		PendingState: cols.pendingState, PendingVisitInfoID: cols.pendingVisitInfoID, PendingDeadline: cols.pendingDeadline,
	})
	return translate("update calendar event record", err)
}

// Delete は、calendarwrite.RecordRepository の Delete を実装する。
func (r *CalendarEventRecordRepository) Delete(ctx context.Context, scheduleID string) error {
	return translate("delete calendar event record", r.q(ctx).DeleteCalendarEventRecord(ctx, scheduleID))
}

// recordColumns は、記録の版と保留の版のカラムの値である。保留の版が無ければ、保留のカラムは全て nil である。
type recordColumns struct {
	version            int32
	pendingVersion     *int32
	pendingState       *string
	pendingVisitInfoID *string
	pendingDeadline    *time.Time
}

func recordColumnsOf(rec calendarwrite.Record) (recordColumns, error) {
	v, err := int32Of(rec.Version)
	if err != nil {
		return recordColumns{}, err
	}
	cols := recordColumns{version: v}
	if p := rec.Pending; p != nil {
		pv, err := int32Of(p.Version)
		if err != nil {
			return recordColumns{}, err
		}
		state, deadline := string(p.State), p.Deadline
		cols.pendingVersion, cols.pendingState, cols.pendingVisitInfoID, cols.pendingDeadline = &pv, &state, p.VisitInfoID, &deadline
	}
	return cols, nil
}
