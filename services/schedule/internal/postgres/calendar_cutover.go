package postgres

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendar"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendarimport"
	"github.com/Fukuemon/buddy/services/schedule/internal/postgres/sqlcgen"
)

// CalendarCutoverRepository は、calendarimport.CutoverRepository を実装する。切り替えの記録と、取り込まない予定の記録を読み書きし、
// 切り替えの取り込みで作った予定を消す。
type CalendarCutoverRepository struct{ conn }

// NewCalendarCutoverRepository は CalendarCutoverRepository を作る。
func NewCalendarCutoverRepository(pool *pgxpool.Pool) *CalendarCutoverRepository {
	return &CalendarCutoverRepository{conn{pool}}
}

var _ calendarimport.CutoverRepository = (*CalendarCutoverRepository)(nil)

func toCutover(c sqlcgen.CalendarCutover) calendarimport.Cutover {
	return calendarimport.Cutover{
		ID: c.ID, FacilityID: c.FacilityID, Status: calendarimport.CutoverStatus(c.Status), RangeStart: civil.DateOf(c.RangeStart),
		StartedBy: c.StartedBy, StartedAt: c.StartedAt, FinishedAt: c.FinishedAt,
	}
}

// Create は、open の切り替えを書く。事業所に open の切り替えがあるときは、一意の索引の違反を apperr.ErrConflict で返す。
func (r *CalendarCutoverRepository) Create(ctx context.Context, c calendarimport.Cutover) error {
	return translate("create calendar cutover", r.q(ctx).CreateCalendarCutover(ctx, sqlcgen.CreateCalendarCutoverParams{
		ID: c.ID, FacilityID: c.FacilityID, RangeStart: c.RangeStart.Time(), StartedBy: c.StartedBy,
	}))
}

// Get は、切り替え id を返す。無いときは apperr.ErrNotFound を返す。
func (r *CalendarCutoverRepository) Get(ctx context.Context, id string) (calendarimport.Cutover, error) {
	c, err := r.q(ctx).GetCalendarCutover(ctx, id)
	if err != nil {
		return calendarimport.Cutover{}, translate("get calendar cutover", err)
	}
	return toCutover(c), nil
}

// GetFacilityID は、access.FacilityReader を実装する。切り替え id の事業所の ID を返す。無いときは apperr.ErrNotFound を返す。
func (r *CalendarCutoverRepository) GetFacilityID(ctx context.Context, id string) (string, error) {
	f, err := r.q(ctx).GetCalendarCutoverFacilityID(ctx, id)
	return f, translate("get calendar cutover facility", err)
}

// FindOpen は、事業所 facilityID の open の切り替えを返す。無いときは apperr.ErrNotFound を返す。
func (r *CalendarCutoverRepository) FindOpen(ctx context.Context, facilityID string) (calendarimport.Cutover, error) {
	c, err := r.q(ctx).FindOpenCalendarCutover(ctx, facilityID)
	if err != nil {
		return calendarimport.Cutover{}, translate("find open calendar cutover", err)
	}
	return toCutover(c), nil
}

// Finish は、open の切り替え id を status にし、終えた時刻を入れて返す。open でないか無いときは apperr.ErrNotFound を返す。
func (r *CalendarCutoverRepository) Finish(ctx context.Context, id string, status calendarimport.CutoverStatus) (calendarimport.Cutover, error) {
	c, err := r.q(ctx).FinishCalendarCutover(ctx, sqlcgen.FinishCalendarCutoverParams{ID: id, Status: string(status)})
	if err != nil {
		return calendarimport.Cutover{}, translate("finish calendar cutover", err)
	}
	return toCutover(c), nil
}

// ListLatestRuns は、切り替え cutoverID の取り込みのうち、カレンダーごとに最も新しく終えた成功した取り込みを返す。
func (r *CalendarCutoverRepository) ListLatestRuns(ctx context.Context, cutoverID string) ([]calendar.ImportRun, error) {
	rows, err := r.q(ctx).ListLatestCutoverImportRuns(ctx, &cutoverID)
	if err != nil {
		return nil, translate("list latest cutover import runs", err)
	}
	out := make([]calendar.ImportRun, len(rows))
	for i, row := range rows {
		out[i] = toImportRun(row)
	}
	return out, nil
}

// ReplaceSkips は、切り替え cutoverID のカレンダー externalCalendarID の取り込まない予定の記録を、skips に置き換える。
// トランザクションの中で呼ぶ。
func (r *CalendarCutoverRepository) ReplaceSkips(ctx context.Context, cutoverID, externalCalendarID string, skips []calendarimport.CutoverSkip) error {
	q := r.q(ctx)
	if err := q.DeleteCalendarCutoverSkips(ctx, sqlcgen.DeleteCalendarCutoverSkipsParams{CutoverID: cutoverID, ExternalCalendarID: externalCalendarID}); err != nil {
		return translate("delete calendar cutover skips", err)
	}
	for _, s := range skips {
		err := q.CreateCalendarCutoverSkip(ctx, sqlcgen.CreateCalendarCutoverSkipParams{
			CutoverID: s.CutoverID, FacilityID: s.FacilityID, ExternalCalendarID: s.ExternalCalendarID, ExternalEventID: s.ExternalEventID, Revision: s.Revision,
		})
		if err != nil {
			return translate("create calendar cutover skip", err)
		}
	}
	return nil
}

// ListSkips は、切り替え cutoverID のカレンダー externalCalendarID の取り込まない予定の記録を返す。
func (r *CalendarCutoverRepository) ListSkips(ctx context.Context, cutoverID, externalCalendarID string) ([]calendarimport.CutoverSkip, error) {
	rows, err := r.q(ctx).ListCalendarCutoverSkips(ctx, sqlcgen.ListCalendarCutoverSkipsParams{CutoverID: cutoverID, ExternalCalendarID: externalCalendarID})
	if err != nil {
		return nil, translate("list calendar cutover skips", err)
	}
	out := make([]calendarimport.CutoverSkip, len(rows))
	for i, row := range rows {
		out[i] = calendarimport.CutoverSkip{
			CutoverID: row.CutoverID, FacilityID: row.FacilityID, ExternalCalendarID: row.ExternalCalendarID, ExternalEventID: row.ExternalEventID, Revision: row.Revision,
		}
	}
	return out, nil
}

// ListLinks は、切り替え cutoverID の取り込みで作った予定の対応を返す。
func (r *CalendarCutoverRepository) ListLinks(ctx context.Context, cutoverID string) ([]calendar.EventLink, error) {
	rows, err := r.q(ctx).ListCutoverEventLinks(ctx, &cutoverID)
	if err != nil {
		return nil, translate("list cutover event links", err)
	}
	out := make([]calendar.EventLink, len(rows))
	for i, l := range rows {
		out[i] = toLink(l)
	}
	return out, nil
}

// DeleteImported は、予定の対応 links と、対応する単発の予定と繰り返しの予定と、それらの訪問の情報を消す。
// 繰り返しの予定の回を置き換えた予定も消す。トランザクションの中で呼ぶ。
func (r *CalendarCutoverRepository) DeleteImported(ctx context.Context, links []calendar.EventLink) error {
	if len(links) == 0 {
		return nil
	}
	q := r.q(ctx)
	ids := make([]string, len(links))
	for i, l := range links {
		ids[i] = l.ID
	}
	targets, err := q.DeleteExternalEventLinksByID(ctx, ids)
	if err != nil {
		return translate("delete external event links", err)
	}
	var scheduleIDs, recurringIDs []string
	for _, t := range targets {
		if t.ScheduleID != nil {
			scheduleIDs = append(scheduleIDs, *t.ScheduleID)
		}
		if t.RecurringScheduleID != nil {
			recurringIDs = append(recurringIDs, *t.RecurringScheduleID)
		}
	}
	singleInfos, err := q.DeleteImportedSchedules(ctx, sqlcgen.DeleteImportedSchedulesParams{Ids: nonNil(scheduleIDs), RecurringScheduleIds: nonNil(recurringIDs)})
	if err != nil {
		return translate("delete imported schedules", err)
	}
	recurringInfos, err := q.DeleteImportedRecurringSchedules(ctx, nonNil(recurringIDs))
	if err != nil {
		return translate("delete imported recurring schedules", err)
	}
	var infos []string
	for _, id := range append(singleInfos, recurringInfos...) {
		if id != nil {
			infos = append(infos, *id)
		}
	}
	return translate("delete imported visit infos", q.DeleteImportedVisitInfos(ctx, nonNil(infos)))
}
