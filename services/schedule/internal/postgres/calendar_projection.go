package postgres

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendarsync"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/scheduleview"
	"github.com/Fukuemon/buddy/services/schedule/internal/postgres/sqlcgen"
)

// CalendarProjectionRepository は、calendarsync.Projections を実装する。Google カレンダーの予定の写し（Projection）を読み書きする。
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
