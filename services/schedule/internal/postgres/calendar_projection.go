package postgres

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendarsync"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/scheduleview"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/visit"
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

// Put は、calendarsync.Projections の Put を実装する。写した時刻は DB の今の時刻にする。
func (r *CalendarProjectionRepository) Put(ctx context.Context, p scheduleview.Projection) error {
	err := r.q(ctx).PutCalendarEventProjection(ctx, sqlcgen.PutCalendarEventProjectionParams{
		ExternalCalendarID: p.ExternalCalendarID, ExternalEventID: p.EventID, FacilityID: p.FacilityID, StaffID: p.StaffID,
		RecurringEventID: optional(p.RecurringEventID), OriginalStartAt: p.OriginalStart.At, OriginalStartDate: nullDate(p.OriginalStart.Date),
		Status: string(p.Status), Title: p.Title,
		StartAt: p.Start.At, StartDate: nullDate(p.Start.Date), EndAt: p.End.At, EndDate: nullDate(p.End.Date),
		TimeZone: optional(p.TimeZone), Recurrence: nonNil(p.Recurrence), Etag: p.ETag, GoogleUpdatedAt: p.GoogleUpdatedAt,
		LastEndDate: nullDate(p.LastEndDate), TimeUnreadable: p.TimeUnreadable,
	})
	return translate("put calendar event projection", err)
}

// CancelOccurrences は、calendarsync.Projections の CancelOccurrences を実装する。
func (r *CalendarProjectionRepository) CancelOccurrences(ctx context.Context, externalCalendarID, parentEventID string) error {
	err := r.q(ctx).CancelCalendarEventProjectionOccurrences(ctx, sqlcgen.CancelCalendarEventProjectionOccurrencesParams{
		ExternalCalendarID: externalCalendarID, ParentEventID: &parentEventID,
	})
	return translate("cancel calendar event projection occurrences", err)
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
	return r.projectionDetails(ctx, rows)
}

// ListRecordedEvents は、scheduleview.RecordedEvents の ListRecordedEvents を実装する。
func (r *CalendarProjectionRepository) ListRecordedEvents(ctx context.Context, facilityID string, ids []string) (map[string]scheduleview.RecordedEvent, error) {
	rows, err := r.q(ctx).ListConfirmedCalendarEventRecords(ctx, sqlcgen.ListConfirmedCalendarEventRecordsParams{FacilityID: facilityID, ScheduleIds: ids})
	if err != nil {
		return nil, translate("list confirmed calendar event records", err)
	}
	out := make(map[string]scheduleview.RecordedEvent, len(rows))
	for _, row := range rows {
		out[row.ScheduleID] = scheduleview.RecordedEvent{
			ExternalCalendarID: row.ExternalCalendarID, ExternalEventID: row.ExternalEventID, RecurringEventID: row.RecurringEventID,
		}
	}
	return out, nil
}

// GetBySchedule は、scheduleview.Projections の GetBySchedule を実装する。記録の予定の ID で引き、無ければ記録の無い行を一覧での ID で引く。
func (r *CalendarProjectionRepository) GetBySchedule(ctx context.Context, facilityID, id string) (scheduleview.ProjectionDetail, error) {
	var row sqlcgen.ListCalendarEventProjectionsByFacilityRow
	byRecord, err := r.q(ctx).GetCalendarEventProjectionByRecord(ctx, sqlcgen.GetCalendarEventProjectionByRecordParams{ScheduleID: id, FacilityID: facilityID})
	switch {
	case err == nil:
		row = sqlcgen.ListCalendarEventProjectionsByFacilityRow(byRecord)
	case !errors.Is(err, pgx.ErrNoRows):
		return scheduleview.ProjectionDetail{}, translate("get calendar event projection by record", err)
	default:
		byID, err := r.q(ctx).GetCalendarEventProjectionByListID(ctx, sqlcgen.GetCalendarEventProjectionByListIDParams{ScheduleID: id, FacilityID: facilityID})
		if err != nil {
			return scheduleview.ProjectionDetail{}, translate("get calendar event projection by list id", err)
		}
		row = sqlcgen.ListCalendarEventProjectionsByFacilityRow(byID)
	}
	out, err := r.projectionDetails(ctx, []sqlcgen.ListCalendarEventProjectionsByFacilityRow{row})
	if err != nil {
		return scheduleview.ProjectionDetail{}, err
	}
	return out[0], nil
}

// projectionDetails は、Projection の行に、記録の訪問の情報の区分を 1 回の問い合わせでまとめて引いて付ける。
func (r *CalendarProjectionRepository) projectionDetails(ctx context.Context, rows []sqlcgen.ListCalendarEventProjectionsByFacilityRow) ([]scheduleview.ProjectionDetail, error) {
	cats, err := r.visitCategories(ctx, visitInfoIDs(rows, func(row sqlcgen.ListCalendarEventProjectionsByFacilityRow) *string { return row.VisitInfoID }))
	if err != nil {
		return nil, err
	}
	out := make([]scheduleview.ProjectionDetail, len(rows))
	for i, row := range rows {
		out[i] = projectionDetailOf(row, cats)
	}
	return out, nil
}

// projectionDetailOf は、Projection の行を、職員の名前、一覧での予定の ID、記録の訪問の情報を付けた行にする。
// 訪問の情報の区分は categories から引く。
func projectionDetailOf(row sqlcgen.ListCalendarEventProjectionsByFacilityRow, categories map[string][]visit.Category) scheduleview.ProjectionDetail {
	return scheduleview.ProjectionDetail{
		Projection: scheduleview.Projection{
			ExternalCalendarID: row.ExternalCalendarID, EventID: row.ExternalEventID, FacilityID: row.FacilityID, StaffID: row.StaffID,
			RecurringEventID: deref(row.RecurringEventID),
			OriginalStart:    scheduleview.ProjectionTime{At: row.OriginalStartAt, Date: datePtr(row.OriginalStartDate)},
			Status:           scheduleview.ProjectionStatus(row.Status), Title: row.Title,
			Start:    scheduleview.ProjectionTime{At: row.StartAt, Date: datePtr(row.StartDate)},
			End:      scheduleview.ProjectionTime{At: row.EndAt, Date: datePtr(row.EndDate)},
			TimeZone: deref(row.TimeZone), Recurrence: row.Recurrence, ETag: row.Etag, GoogleUpdatedAt: row.GoogleUpdatedAt,
			LastEndDate: datePtr(row.LastEndDate), ProjectedAt: row.ProjectedAt, TimeUnreadable: row.TimeUnreadable,
		},
		StaffName:  row.StaffName,
		ScheduleID: row.ScheduleID,
		Visit: visitDetailColumns{
			VisitInfoID: row.VisitInfoID, PatientID: row.PatientID, PatientName: row.PatientName,
			AssignedStaffID: row.AssignedStaffID, AssignedStaffName: row.AssignedStaffName,
			CompanionID: row.CompanionID, CompanionName: row.CompanionName,
			ServiceCodeID: row.ServiceCodeID, ServiceCode: row.ServiceCode,
		}.detail(categories),
	}
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

// DeleteByFacility は、calendarimport.Projections の DeleteByFacility を実装する。事業所 facilityID の行を全て消す。
func (r *CalendarProjectionRepository) DeleteByFacility(ctx context.Context, facilityID string) error {
	return translate("delete calendar event projections by facility", r.q(ctx).DeleteCalendarEventProjectionsByFacility(ctx, facilityID))
}

var _ scheduleview.Cutovers = (*CalendarProjectionRepository)(nil)

// FindOpenCutover は、scheduleview.Cutovers の FindOpenCutover を実装する。open の切り替えが無ければ nil を返す。
func (r *CalendarProjectionRepository) FindOpenCutover(ctx context.Context, facilityID string) (*scheduleview.OpenCutover, error) {
	c, err := r.q(ctx).FindOpenCalendarCutoverWithStarter(ctx, facilityID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, translate("find open calendar cutover", err)
	}
	return &scheduleview.OpenCutover{
		StartedAt: c.StartedAt, StartedBy: c.StartedBy, StartedByName: c.StartedByName, RangeStart: civil.DateOf(c.RangeStart),
	}, nil
}
