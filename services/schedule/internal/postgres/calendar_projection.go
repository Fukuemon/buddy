package postgres

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendarsync"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/scheduleview"
	"github.com/Fukuemon/buddy/services/schedule/internal/postgres/sqlcgen"
)

// CalendarProjectionRepository は、calendarsync.Projections と、scheduleview.Projections と scheduleview.CalendarSyncs を実装する。
// Google カレンダーの予定の写し（Projection）を読み書きし、カレンダーの同期の状況を読む。
type CalendarProjectionRepository struct{ conn }

// NewCalendarProjectionRepository は CalendarProjectionRepository を作る。
func NewCalendarProjectionRepository(pool *pgxpool.Pool) *CalendarProjectionRepository {
	return &CalendarProjectionRepository{conn{pool}}
}

var _ calendarsync.Projections = (*CalendarProjectionRepository)(nil)

// Put は、p の行を足すか、同じカレンダーと Google の予定の ID の行を p にする。写した時刻は DB の今の時刻にする。
func (r *CalendarProjectionRepository) Put(ctx context.Context, p scheduleview.Projection) error {
	err := r.q(ctx).PutCalendarEventProjection(ctx, sqlcgen.PutCalendarEventProjectionParams{
		ExternalCalendarID: p.ExternalCalendarID, ExternalEventID: p.EventID, FacilityID: p.FacilityID, StaffID: p.StaffID,
		RecurringEventID: optional(p.RecurringEventID), OriginalStartAt: p.OriginalStart.At, OriginalStartDate: nullDate(p.OriginalStart.Date),
		Status: string(p.Status), Title: p.Title,
		StartAt: p.Start.At, StartDate: nullDate(p.Start.Date), EndAt: p.End.At, EndDate: nullDate(p.End.Date),
		TimeZone: optional(p.TimeZone), Recurrence: nonNil(p.Recurrence), Etag: p.ETag, GoogleUpdatedAt: p.GoogleUpdatedAt,
		LastEndDate: nullDate(p.LastEndDate),
	})
	return translate("put calendar event projection", err)
}

// Delete は、カレンダー externalCalendarID の予定 eventID の行と、その予定を親にする例外の回の行を消す。行が無くてもエラーにしない。
func (r *CalendarProjectionRepository) Delete(ctx context.Context, externalCalendarID, eventID string) error {
	err := r.q(ctx).DeleteCalendarEventProjection(ctx, sqlcgen.DeleteCalendarEventProjectionParams{
		ExternalCalendarID: externalCalendarID, ExternalEventID: eventID,
	})
	return translate("delete calendar event projection", err)
}

// DeleteExcept は、カレンダー externalCalendarID の行のうち、Google の予定の ID が eventIDs に無い行を消す。
func (r *CalendarProjectionRepository) DeleteExcept(ctx context.Context, externalCalendarID string, eventIDs []string) error {
	err := r.q(ctx).DeleteCalendarEventProjectionsExcept(ctx, sqlcgen.DeleteCalendarEventProjectionsExceptParams{
		ExternalCalendarID: externalCalendarID, ExternalEventIds: nonNil(eventIDs),
	})
	return translate("delete calendar event projections except", err)
}

// DeleteEndedBefore は、カレンダー externalCalendarID の行のうち、終わる日が before より前の行を消す。終わる日の無い行は残す。
func (r *CalendarProjectionRepository) DeleteEndedBefore(ctx context.Context, externalCalendarID string, before civil.Date) error {
	err := r.q(ctx).DeleteCalendarEventProjectionsEndedBefore(ctx, sqlcgen.DeleteCalendarEventProjectionsEndedBeforeParams{
		ExternalCalendarID: externalCalendarID, Before: before.Time(),
	})
	return translate("delete ended calendar event projections", err)
}

var (
	_ scheduleview.Projections   = (*CalendarProjectionRepository)(nil)
	_ scheduleview.CalendarSyncs = (*CalendarProjectionRepository)(nil)
)

// ListByFacility は、scheduleview.Projections の ListByFacility を実装する。
func (r *CalendarProjectionRepository) ListByFacility(ctx context.Context, facilityID string, from civil.Date) ([]scheduleview.ProjectionDetail, error) {
	rows, err := r.q(ctx).ListCalendarEventProjectionsByFacility(ctx, sqlcgen.ListCalendarEventProjectionsByFacilityParams{
		FacilityID: facilityID, FromDate: from.Time(),
	})
	if err != nil {
		return nil, translate("list calendar event projections", err)
	}
	out := make([]scheduleview.ProjectionDetail, len(rows))
	for i, row := range rows {
		out[i] = scheduleview.ProjectionDetail{
			Projection: scheduleview.Projection{
				ExternalCalendarID: row.ExternalCalendarID, EventID: row.ExternalEventID, FacilityID: row.FacilityID, StaffID: row.StaffID,
				RecurringEventID: deref(row.RecurringEventID),
				OriginalStart:    scheduleview.ProjectionTime{At: row.OriginalStartAt, Date: datePtr(row.OriginalStartDate)},
				Status:           scheduleview.ProjectionStatus(row.Status), Title: row.Title,
				Start:    scheduleview.ProjectionTime{At: row.StartAt, Date: datePtr(row.StartDate)},
				End:      scheduleview.ProjectionTime{At: row.EndAt, Date: datePtr(row.EndDate)},
				TimeZone: deref(row.TimeZone), Recurrence: row.Recurrence, ETag: row.Etag, GoogleUpdatedAt: row.GoogleUpdatedAt,
				LastEndDate: datePtr(row.LastEndDate), ProjectedAt: row.ProjectedAt,
			},
			StaffName: row.StaffName,
		}
	}
	return out, nil
}

// ListSyncsByFacility は、scheduleview.CalendarSyncs の ListSyncsByFacility を実装する。
func (r *CalendarProjectionRepository) ListSyncsByFacility(ctx context.Context, facilityID string) ([]scheduleview.CalendarSync, error) {
	rows, err := r.q(ctx).ListCalendarSyncStatusesByFacility(ctx, facilityID)
	if err != nil {
		return nil, translate("list calendar sync statuses", err)
	}
	out := make([]scheduleview.CalendarSync, len(rows))
	for i, row := range rows {
		out[i] = scheduleview.CalendarSync{
			ExternalCalendarID: row.ExternalCalendarID, StaffID: row.StaffID, StaffName: row.StaffName,
			LastStatus: scheduleview.SyncStatus(row.LastStatus), LastSucceededAt: row.LastSyncedAt, LastError: row.LastError,
		}
	}
	return out, nil
}
