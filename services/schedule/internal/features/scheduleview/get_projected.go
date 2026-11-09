package scheduleview

import (
	"context"
	"errors"
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/schedule"
)

// GetProjected は、google_primary の事業所の Projection の単発の予定を、一覧と同じ ID と内容で返す（ADR-0029）。
type GetProjected struct {
	deps  ProjectionDeps
	staff StaffRefs
}

// NewGetProjected は GetProjected を作る。deps は、Projections、Rules、Patients、ServiceCodes、Types を使う。
// deps の Now は、繰り返しの回を引くときに親を展開する期間（RetainedRange）を決める。
func NewGetProjected(deps ProjectionDeps, staff StaffRefs) GetProjected {
	return GetProjected{deps: deps, staff: staff}
}

// Do は、事業所 facilityID の、一覧での ID が id の予定を返す。カレンダーの職員を予定の職員とみなし、buddy の予定と同じ閲覧の判定を当てる。
// 繰り返しの予定の展開した回（OccurrenceScheduleID の ID）は、Projection を保持する期間の中で親を展開して引き、一覧と同じ内容で返す。
// 予定が無いとき、取り消した予定、繰り返しの予定の親、一覧に出さない予定（終日の予定など）は apperr.ErrNotFound を返す。
// 見てよい職員の予定でなければ apperr.ErrForbidden を返す。
func (g GetProjected) Do(ctx context.Context, facilityID, id string) (Detail, error) {
	e, err := g.find(ctx, facilityID, id)
	if err != nil {
		return Detail{}, err
	}
	if err := schedule.RequireScheduleAccess(ctx, g.staff, e.row.StaffID, false); err != nil {
		return Detail{}, err
	}
	b, err := newProjectionBuilder(ctx, g.deps, facilityID, []projectedEvent{e})
	if err != nil {
		return Detail{}, err
	}
	return b.detail(e), nil
}

// find は、一覧での ID が id の行を読み替える。行が無ければ、繰り返しの親を展開した回から探す。
func (g GetProjected) find(ctx context.Context, facilityID, id string) (projectedEvent, error) {
	row, err := g.deps.Projections.GetBySchedule(ctx, facilityID, id)
	if errors.Is(err, apperr.ErrNotFound) {
		now := time.Now
		if g.deps.Now != nil {
			now = g.deps.Now
		}
		from, to := RetainedRange(now())
		rows, err := g.deps.Projections.ListByFacility(ctx, facilityID, dayBefore(from))
		if err != nil {
			return projectedEvent{}, err
		}
		rows = filter(rows, func(r ProjectionDetail) bool { return r.FacilityID == facilityID })
		e, ok, err := findOccurrence(ctx, g.deps.Projections, facilityID, rows, g.deps.Rules, id, from, to)
		if err != nil {
			return projectedEvent{}, err
		}
		if !ok {
			return projectedEvent{}, apperr.ErrNotFound
		}
		return e, nil
	}
	if err != nil {
		return projectedEvent{}, err
	}
	if row.Status != ProjectionConfirmed || row.IsParent() {
		return projectedEvent{}, apperr.ErrNotFound
	}
	rd := g.deps.Rules.Read(row.Projection)
	if !rd.Kind.IsSchedule() {
		return projectedEvent{}, apperr.ErrNotFound
	}
	return projectedEvent{row: row, reading: rd}, nil
}
