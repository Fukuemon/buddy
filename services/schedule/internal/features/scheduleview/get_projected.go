package scheduleview

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/schedule"
)

// GetProjected は、google_primary の事業所の Projection の単発の予定を、一覧と同じ ID と内容で返す（ADR-0026）。
type GetProjected struct {
	deps  ProjectionDeps
	staff StaffRefs
}

// NewGetProjected は GetProjected を作る。deps は、Projections、Rules、Patients、ServiceCodes、Types を使う。
func NewGetProjected(deps ProjectionDeps, staff StaffRefs) GetProjected {
	return GetProjected{deps: deps, staff: staff}
}

// Do は、事業所 facilityID の、一覧での ID が id の予定を返す。カレンダーの職員を予定の職員とみなし、buddy の予定と同じ閲覧の判定を当てる。
// 予定が無いとき、取り消した予定、繰り返しの予定の親、一覧に出さない予定（終日の予定など）は apperr.ErrNotFound を返す。
// 見てよい職員の予定でなければ apperr.ErrForbidden を返す。繰り返しの回（回の日付付きの ID）は読めない。
func (g GetProjected) Do(ctx context.Context, facilityID, id string) (Detail, error) {
	row, err := g.deps.Projections.GetBySchedule(ctx, facilityID, id)
	if err != nil {
		return Detail{}, err
	}
	if row.Status != ProjectionConfirmed || row.IsParent() {
		return Detail{}, apperr.ErrNotFound
	}
	if err := schedule.RequireScheduleAccess(ctx, g.staff, row.StaffID, false); err != nil {
		return Detail{}, err
	}
	rd := g.deps.Rules.Read(row.Projection)
	if rd.Kind == EventSkipped {
		return Detail{}, apperr.ErrNotFound
	}
	e := projectedEvent{row: row, reading: rd}
	b, err := newProjectionBuilder(ctx, g.deps, facilityID, []projectedEvent{e})
	if err != nil {
		return Detail{}, err
	}
	return b.detail(e), nil
}
