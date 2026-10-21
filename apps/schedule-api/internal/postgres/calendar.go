package postgres

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/Fukuemon/buddy/apps/schedule-api/internal/calendar"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/civil"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/postgres/sqlcgen"
)

// CalendarRepository は、calendar.Repository を実装する。
type CalendarRepository struct{ conn }

// NewCalendarRepository は CalendarRepository を作る。
func NewCalendarRepository(pool *pgxpool.Pool) *CalendarRepository {
	return &CalendarRepository{conn{pool}}
}

var _ calendar.Repository = (*CalendarRepository)(nil)

func toExternalCalendar(c sqlcgen.ExternalCalendar) calendar.ExternalCalendar {
	return calendar.ExternalCalendar{
		ID:         c.ID,
		FacilityID: c.FacilityID,
		StaffID:    c.StaffID,
		Provider:   c.Provider,
		CalendarID: c.ExternalCalendarID,
		DisabledAt: c.DisabledAt,
		CreatedAt:  c.CreatedAt,
		UpdatedAt:  c.UpdatedAt,
	}
}

func toImportRun(r sqlcgen.ImportRun) calendar.ImportRun {
	return calendar.ImportRun{
		ID:                 r.ID,
		FacilityID:         r.FacilityID,
		ExternalCalendarID: r.ExternalCalendarID,
		RequestedBy:        r.RequestedBy,
		RangeStart:         civil.DateOf(r.RangeStart),
		RangeEnd:           civil.DateOf(r.RangeEnd),
		Status:             calendar.RunStatus(r.Status),
		ImportedCount:      int(r.ImportedCount),
		SkippedCount:       int(r.SkippedCount),
		StartedAt:          r.StartedAt,
		FinishedAt:         r.FinishedAt,
	}
}

// Get は、ID が id のカレンダーを、外したものも含めて返す。無いときは apperr.ErrNotFound を返す。
func (r *CalendarRepository) Get(ctx context.Context, id string) (calendar.ExternalCalendar, error) {
	c, err := r.q(ctx).GetExternalCalendar(ctx, id)
	if err != nil {
		return calendar.ExternalCalendar{}, translate("get external calendar", err)
	}
	return toExternalCalendar(c), nil
}

// GetForUpdate は、トランザクションの終わりまでカレンダーの行に排他のロックを取ってから、Get と同じ値を返す。
func (r *CalendarRepository) GetForUpdate(ctx context.Context, id string) (calendar.ExternalCalendar, error) {
	if _, err := r.q(ctx).LockExternalCalendar(ctx, id); err != nil {
		return calendar.ExternalCalendar{}, translate("lock external calendar", err)
	}
	return r.Get(ctx, id)
}

// FindByCalendarID は、provider と calendarID のカレンダーを、外したものも含めて返す。無いときは apperr.ErrNotFound を返す。
func (r *CalendarRepository) FindByCalendarID(ctx context.Context, provider, calendarID string) (calendar.ExternalCalendar, error) {
	c, err := r.q(ctx).FindExternalCalendar(ctx, sqlcgen.FindExternalCalendarParams{Provider: provider, ExternalCalendarID: calendarID})
	if err != nil {
		return calendar.ExternalCalendar{}, translate("find external calendar", err)
	}
	return toExternalCalendar(c), nil
}

// ListByFacility は、事業所の外していないカレンダーを、最後の取り込みを付けて作った順に返す。
func (r *CalendarRepository) ListByFacility(ctx context.Context, facilityID string) ([]calendar.ExternalCalendar, error) {
	rows, err := r.q(ctx).ListExternalCalendarsByFacility(ctx, facilityID)
	if err != nil {
		return nil, translate("list external calendars", err)
	}
	runs, err := r.q(ctx).ListLatestImportRunsByFacility(ctx, facilityID)
	if err != nil {
		return nil, translate("list latest import runs", err)
	}
	latest := make(map[string]calendar.ImportRun, len(runs))
	for _, run := range runs {
		latest[run.ExternalCalendarID] = toImportRun(run)
	}
	out := make([]calendar.ExternalCalendar, len(rows))
	for i, c := range rows {
		out[i] = toExternalCalendar(c)
		if run, ok := latest[c.ID]; ok {
			out[i].LastImport = &run
		}
	}
	return out, nil
}

// Create は、カレンダーを書く。職員に外していないカレンダーがあるときと、同じ外部のカレンダーがあるときは apperr.ErrConflict を返す。
func (r *CalendarRepository) Create(ctx context.Context, c calendar.ExternalCalendar) error {
	err := r.q(ctx).CreateExternalCalendar(ctx, sqlcgen.CreateExternalCalendarParams{
		ID:                 c.ID,
		FacilityID:         c.FacilityID,
		StaffID:            c.StaffID,
		Provider:           c.Provider,
		ExternalCalendarID: c.CalendarID,
	})
	return translate("create external calendar", err)
}

// Enable は、外したカレンダーを結び付け直す。職員に外していないカレンダーがあるときは apperr.ErrConflict を返す。
func (r *CalendarRepository) Enable(ctx context.Context, id string) error {
	return translate("enable external calendar", r.q(ctx).EnableExternalCalendar(ctx, id))
}

// Disable は、カレンダーを外す。外したカレンダーでは何もしない。
func (r *CalendarRepository) Disable(ctx context.Context, id string) error {
	return translate("disable external calendar", r.q(ctx).DisableExternalCalendar(ctx, id))
}

// RunningSince は、カレンダーの取り込みのうち、since より後に始めた running のものがあるかを返す。
func (r *CalendarRepository) RunningSince(ctx context.Context, externalCalendarID string, since time.Time) (bool, error) {
	ok, err := r.q(ctx).ExistsRunningImport(ctx, sqlcgen.ExistsRunningImportParams{ExternalCalendarID: externalCalendarID, Since: since})
	return ok, translate("exists running import", err)
}

// CreateRun は、取り込みの記録を書く。始めた時刻は DB が決める。
func (r *CalendarRepository) CreateRun(ctx context.Context, run calendar.ImportRun) error {
	err := r.q(ctx).CreateImportRun(ctx, sqlcgen.CreateImportRunParams{
		ID:                 run.ID,
		FacilityID:         run.FacilityID,
		ExternalCalendarID: run.ExternalCalendarID,
		RequestedBy:        run.RequestedBy,
		RangeStart:         run.RangeStart.Time(),
		RangeEnd:           run.RangeEnd.Time(),
		Status:             string(run.Status),
	})
	return translate("create import run", err)
}

// FinishRun は、取り込みの記録の状態と件数を run の値にし、終わった時刻を入れて、記録を返す。
func (r *CalendarRepository) FinishRun(ctx context.Context, run calendar.ImportRun) (calendar.ImportRun, error) {
	imported, err := int32Of(run.ImportedCount)
	if err != nil {
		return calendar.ImportRun{}, err
	}
	skipped, err := int32Of(run.SkippedCount)
	if err != nil {
		return calendar.ImportRun{}, err
	}
	row, err := r.q(ctx).FinishImportRun(ctx, sqlcgen.FinishImportRunParams{
		ID:            run.ID,
		Status:        string(run.Status),
		ImportedCount: imported,
		SkippedCount:  skipped,
	})
	if err != nil {
		return calendar.ImportRun{}, translate("finish import run", err)
	}
	return toImportRun(row), nil
}

// ListLinks は、カレンダーの予定の対応を返す。
func (r *CalendarRepository) ListLinks(ctx context.Context, externalCalendarID string) ([]calendar.Link, error) {
	rows, err := r.q(ctx).ListExternalEventLinks(ctx, externalCalendarID)
	if err != nil {
		return nil, translate("list external event links", err)
	}
	out := make([]calendar.Link, len(rows))
	for i, l := range rows {
		out[i] = toLink(l)
	}
	return out, nil
}

func toLink(l sqlcgen.ExternalEventLink) calendar.Link {
	out := calendar.Link{
		ID:                  l.ID,
		FacilityID:          l.FacilityID,
		ExternalCalendarID:  l.ExternalCalendarID,
		ExternalEventID:     l.ExternalEventID,
		RecurringEventID:    l.RecurringEventID,
		ETag:                l.Etag,
		ScheduleID:          l.ScheduleID,
		RecurringScheduleID: l.RecurringScheduleID,
	}
	if l.SyncedVersion != nil {
		out.SyncedVersion = ptr(int(*l.SyncedVersion))
	}
	return out
}

func syncedVersion(v *int) (*int32, error) {
	if v == nil {
		return nil, nil
	}
	n, err := int32Of(*v)
	return &n, err
}

// ActiveByStaff は、職員 staffID に結び付けた外していないカレンダーを返す。無いときは apperr.ErrNotFound を返す。
func (r *CalendarRepository) ActiveByStaff(ctx context.Context, staffID string) (calendar.ExternalCalendar, error) {
	c, err := r.q(ctx).GetActiveExternalCalendarByStaff(ctx, staffID)
	if err != nil {
		return calendar.ExternalCalendar{}, translate("get active external calendar", err)
	}
	return toExternalCalendar(c), nil
}

// LinkBySchedule は、単発の予定 scheduleID の予定の対応を返す。無いときは apperr.ErrNotFound を返す。
func (r *CalendarRepository) LinkBySchedule(ctx context.Context, scheduleID string) (calendar.Link, error) {
	l, err := r.q(ctx).GetExternalEventLinkBySchedule(ctx, &scheduleID)
	if err != nil {
		return calendar.Link{}, translate("get external event link", err)
	}
	return toLink(l), nil
}

// LinkByRecurringSchedule は、繰り返しの予定 recurringScheduleID の予定の対応を返す。無いときは apperr.ErrNotFound を返す。
func (r *CalendarRepository) LinkByRecurringSchedule(ctx context.Context, recurringScheduleID string) (calendar.Link, error) {
	l, err := r.q(ctx).GetExternalEventLinkByRecurringSchedule(ctx, &recurringScheduleID)
	if err != nil {
		return calendar.Link{}, translate("get external event link", err)
	}
	return toLink(l), nil
}

// UpdateLink は、予定の対応 id の etag と、同じにした時点の更新の番号を書く。
func (r *CalendarRepository) UpdateLink(ctx context.Context, id, etag string, version int) error {
	v, err := syncedVersion(&version)
	if err != nil {
		return err
	}
	return translate("update external event link", r.q(ctx).UpdateExternalEventLink(ctx, sqlcgen.UpdateExternalEventLinkParams{
		ID: id, Etag: etag, SyncedVersion: v,
	}))
}

// DeleteLink は、予定の対応 id を消す。
func (r *CalendarRepository) DeleteLink(ctx context.Context, id string) error {
	return translate("delete external event link", r.q(ctx).DeleteExternalEventLink(ctx, id))
}

// CreateLink は、予定の対応を書く。同じ外部の予定の対応があるときは apperr.ErrConflict を返す。
func (r *CalendarRepository) CreateLink(ctx context.Context, l calendar.Link) error {
	v, err := syncedVersion(l.SyncedVersion)
	if err != nil {
		return err
	}
	err = r.q(ctx).CreateExternalEventLink(ctx, sqlcgen.CreateExternalEventLinkParams{
		SyncedVersion:       v,
		ID:                  l.ID,
		FacilityID:          l.FacilityID,
		ExternalCalendarID:  l.ExternalCalendarID,
		ExternalEventID:     l.ExternalEventID,
		RecurringEventID:    l.RecurringEventID,
		Etag:                l.ETag,
		ScheduleID:          l.ScheduleID,
		RecurringScheduleID: l.RecurringScheduleID,
	})
	return translate("create external event link", err)
}
