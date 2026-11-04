package calendarimport

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendar"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/scheduleview"
)

// GetCutover は、事業所の切り替えの状況を返す。
type GetCutover struct {
	syncs    scheduleview.CalendarSyncs
	cutovers CutoverRepository
	guard    organization.Guard
}

// NewGetCutover は GetCutover を作る。
func NewGetCutover(syncs scheduleview.CalendarSyncs, cutovers CutoverRepository, guard organization.Guard) GetCutover {
	return GetCutover{syncs: syncs, cutovers: cutovers, guard: guard}
}

// Do は、事業所 facilityID の open の切り替えと、外していない全てのカレンダーの同期の状況と、この切り替えで最後に成功した取り込みを返す。
// open の切り替えが無ければ、CutoverState.Cutover は nil で、取り込みは持たない。
func (u GetCutover) Do(ctx context.Context, facilityID string) (CutoverState, error) {
	if err := u.guard(ctx); err != nil {
		return CutoverState{}, err
	}
	open, err := findOpen(ctx, u.cutovers, facilityID)
	if err != nil {
		return CutoverState{}, err
	}
	syncs, err := u.syncs.ListSyncsByFacility(ctx, facilityID)
	if err != nil {
		return CutoverState{}, err
	}
	runs := map[string]calendar.ImportRun{}
	if open != nil {
		latest, err := u.cutovers.ListLatestRuns(ctx, open.ID)
		if err != nil {
			return CutoverState{}, err
		}
		for _, r := range latest {
			runs[r.ExternalCalendarID] = r
		}
	}
	out := CutoverState{Cutover: open, Calendars: make([]CutoverCalendar, len(syncs))}
	for i, s := range syncs {
		out.Calendars[i] = CutoverCalendar{Sync: s}
		if r, ok := runs[s.ExternalCalendarID]; ok {
			out.Calendars[i].LastImport = &r
		}
	}
	return out, nil
}
