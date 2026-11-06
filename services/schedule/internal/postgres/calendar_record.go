package postgres

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendar"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendarsync"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendarwrite"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/postgres/sqlcgen"
)

// CalendarEventRecordRepository は、calendarwrite.RecordRepository と calendarsync.PendingRecords を実装する。
type CalendarEventRecordRepository struct{ conn }

// NewCalendarEventRecordRepository は CalendarEventRecordRepository を作る。
func NewCalendarEventRecordRepository(pool *pgxpool.Pool) *CalendarEventRecordRepository {
	return &CalendarEventRecordRepository{conn{pool}}
}

var (
	_ calendarwrite.RecordRepository = (*CalendarEventRecordRepository)(nil)
	_ calendarsync.PendingRecords    = (*CalendarEventRecordRepository)(nil)
)

// GetForUpdate は、calendar.EventRecords の GetForUpdate を実装する。行を FOR UPDATE で読む。
func (r *CalendarEventRecordRepository) GetForUpdate(ctx context.Context, scheduleID string) (calendar.EventRecord, error) {
	row, err := r.q(ctx).GetCalendarEventRecordForUpdate(ctx, scheduleID)
	if err != nil {
		return calendar.EventRecord{}, translate("get calendar event record", err)
	}
	return recordOf(row.ScheduleID, row.FacilityID, row.ExternalCalendarID, row.ExternalEventID, row.VisitInfoID, row.Version,
		row.PendingVersion, row.PendingState, row.PendingVisitInfoID, row.PendingDeadline, row.PendingExternalCalendarID, row.PendingExternalEventID), nil
}

// ClaimExpired は、calendarsync.PendingRecords の ClaimExpired を実装する。行を FOR UPDATE SKIP LOCKED で取る。
func (r *CalendarEventRecordRepository) ClaimExpired(ctx context.Context, now time.Time, max int, lease time.Duration,
	modes []organization.SourceMode) ([]calendarsync.PendingCheck, error) {
	n, err := int32Of(max)
	if err != nil {
		return nil, err
	}
	until := now.Add(lease)
	rows, err := r.q(ctx).ClaimExpiredCalendarEventRecords(ctx, sqlcgen.ClaimExpiredCalendarEventRecordsParams{
		LockedUntil: &until, Now: &now, Modes: modeStrings(modes), MaxCount: n,
	})
	if err != nil {
		return nil, translate("claim expired calendar event records", err)
	}
	out := make([]calendarsync.PendingCheck, len(rows))
	for i, row := range rows {
		rec := recordOf(row.ScheduleID, row.FacilityID, row.ExternalCalendarID, row.ExternalEventID, row.VisitInfoID, row.Version,
			row.PendingVersion, row.PendingState, row.PendingVisitInfoID, row.PendingDeadline, row.PendingExternalCalendarID, row.PendingExternalEventID)
		out[i] = calendarsync.PendingCheck{
			Record: rec,
			Calendar: calendar.ExternalCalendar{
				ID: rec.PendingLocation().ExternalCalendarID, FacilityID: row.FacilityID, StaffID: row.StaffID, Provider: row.Provider, CalendarID: row.CalendarID,
			},
			LockedUntil: until,
		}
		if row.PendingLockedUntil != nil {
			out[i].LockedUntil = *row.PendingLockedUntil
		}
	}
	return out, nil
}

// Release は、calendarsync.PendingRecords の Release を実装する。
func (r *CalendarEventRecordRepository) Release(ctx context.Context, p calendarsync.PendingCheck) error {
	err := r.q(ctx).ReleaseCalendarEventRecord(ctx, sqlcgen.ReleaseCalendarEventRecordParams{ScheduleID: p.Record.ScheduleID, LockedUntil: &p.LockedUntil})
	return translate("release calendar event record", err)
}

// recordOf は、記録の行のカラムから記録を作る。保留のカラムが揃っていなければ、保留の版を持たない。
// 移す先のカラムがあれば、保留の版は予定を移す書き込みである。
func recordOf(scheduleID, facilityID, calendarID, eventID string, visitInfoID *string, version int32,
	pendingVersion *int32, pendingState, pendingVisitInfoID *string, pendingDeadline *time.Time, pendingCalendarID, pendingEventID *string) calendar.EventRecord {
	rec := calendar.EventRecord{
		ScheduleID: scheduleID, FacilityID: facilityID, ExternalCalendarID: calendarID, ExternalEventID: eventID,
		VisitInfoID: visitInfoID, Version: int(version),
	}
	if pendingVersion != nil && pendingState != nil && pendingDeadline != nil {
		rec.Pending = &calendar.PendingWrite{
			Version: int(*pendingVersion), State: calendar.PendingState(*pendingState), VisitInfoID: pendingVisitInfoID, Deadline: *pendingDeadline,
		}
		if pendingCalendarID != nil && pendingEventID != nil {
			rec.Pending.MoveTo = &calendar.EventLocation{ExternalCalendarID: *pendingCalendarID, ExternalEventID: *pendingEventID}
		}
	}
	return rec
}

// Create は、calendarwrite.RecordRepository の Create を実装する。
func (r *CalendarEventRecordRepository) Create(ctx context.Context, rec calendar.EventRecord) error {
	cols, err := recordColumnsOf(rec)
	if err != nil {
		return err
	}
	err = r.q(ctx).CreateCalendarEventRecord(ctx, sqlcgen.CreateCalendarEventRecordParams{
		ScheduleID: rec.ScheduleID, FacilityID: rec.FacilityID, ExternalCalendarID: rec.ExternalCalendarID, ExternalEventID: rec.ExternalEventID,
		VisitInfoID: rec.VisitInfoID, Version: cols.version, PendingVersion: cols.pendingVersion, PendingState: cols.pendingState,
		PendingVisitInfoID: cols.pendingVisitInfoID, PendingDeadline: cols.pendingDeadline,
		PendingExternalCalendarID: cols.pendingCalendarID, PendingExternalEventID: cols.pendingEventID,
	})
	return translate("create calendar event record", err)
}

// Update は、calendar.EventRecords の Update を実装する。
func (r *CalendarEventRecordRepository) Update(ctx context.Context, rec calendar.EventRecord) error {
	cols, err := recordColumnsOf(rec)
	if err != nil {
		return err
	}
	err = r.q(ctx).UpdateCalendarEventRecord(ctx, sqlcgen.UpdateCalendarEventRecordParams{
		ScheduleID: rec.ScheduleID, ExternalCalendarID: rec.ExternalCalendarID, ExternalEventID: rec.ExternalEventID,
		VisitInfoID: rec.VisitInfoID, Version: cols.version, PendingVersion: cols.pendingVersion,
		PendingState: cols.pendingState, PendingVisitInfoID: cols.pendingVisitInfoID, PendingDeadline: cols.pendingDeadline,
		PendingExternalCalendarID: cols.pendingCalendarID, PendingExternalEventID: cols.pendingEventID,
	})
	return translate("update calendar event record", err)
}

// Delete は、calendar.EventRecords の Delete を実装する。
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
	pendingCalendarID  *string
	pendingEventID     *string
}

func recordColumnsOf(rec calendar.EventRecord) (recordColumns, error) {
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
		if to := p.MoveTo; to != nil {
			cols.pendingCalendarID, cols.pendingEventID = &to.ExternalCalendarID, &to.ExternalEventID
		}
	}
	return cols, nil
}
