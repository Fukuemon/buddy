package inmem

import (
	"context"
	"slices"
	"strings"
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendar"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendarimport"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/scheduleview"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/visit"
)

// GetForUpdate は、calendarimport.FacilityModes の GetForUpdate を実装する。メモリ上の実装はロックを取らない。
func (s Facilities) GetForUpdate(_ context.Context, facilityID string) (organization.Facility, error) {
	return get(s.Facilities, facilityID)
}

// ChangeSourceMode は、calendarimport.FacilityModes の ChangeSourceMode を実装する。
func (s Facilities) ChangeSourceMode(_ context.Context, facilityID string, mode organization.SourceMode) error {
	f, err := get(s.Facilities, facilityID)
	if err != nil {
		return err
	}
	f.SourceMode = mode
	s.Facilities[facilityID] = f
	return nil
}

// DeleteByFacility は、calendarimport.Projections の DeleteByFacility を実装する。
func (s Projections) DeleteByFacility(_ context.Context, facilityID string) error {
	for k, p := range s.Projections {
		if p.FacilityID == facilityID {
			delete(s.Projections, k)
		}
	}
	return nil
}

// Cutovers は、calendarimport.CutoverRepository のメモリ上の実装である。
type Cutovers struct{ *Store }

// Create は、calendarimport.CutoverRepository の Create を実装する。開始の時刻は今の時刻にする。
func (s Cutovers) Create(_ context.Context, c calendarimport.Cutover) error {
	for _, cur := range s.Cutovers {
		if cur.FacilityID == c.FacilityID && cur.Status == calendarimport.CutoverOpen {
			return apperr.ErrConflict
		}
	}
	c.Status, c.StartedAt = calendarimport.CutoverOpen, time.Now()
	s.Cutovers[c.ID] = c
	return nil
}

// Get は、calendarimport.CutoverRepository の Get を実装する。
func (s Cutovers) Get(_ context.Context, id string) (calendarimport.Cutover, error) {
	return get(s.Cutovers, id)
}

// GetFacilityID は、access.FacilityReader を実装する。
func (s Cutovers) GetFacilityID(_ context.Context, id string) (string, error) {
	c, err := get(s.Cutovers, id)
	return c.FacilityID, err
}

// FindOpen は、calendarimport.CutoverRepository の FindOpen を実装する。
func (s Cutovers) FindOpen(_ context.Context, facilityID string) (calendarimport.Cutover, error) {
	for _, c := range s.Cutovers {
		if c.FacilityID == facilityID && c.Status == calendarimport.CutoverOpen {
			return c, nil
		}
	}
	return calendarimport.Cutover{}, apperr.ErrNotFound
}

// Finish は、calendarimport.CutoverRepository の Finish を実装する。
func (s Cutovers) Finish(_ context.Context, id string, status calendarimport.CutoverStatus) (calendarimport.Cutover, error) {
	c, ok := s.Cutovers[id]
	if !ok || c.Status != calendarimport.CutoverOpen {
		return calendarimport.Cutover{}, apperr.ErrNotFound
	}
	now := time.Now()
	c.Status, c.FinishedAt = status, &now
	s.Cutovers[id] = c
	return c, nil
}

// ListLatestRuns は、calendarimport.CutoverRepository の ListLatestRuns を実装する。
func (s Cutovers) ListLatestRuns(_ context.Context, cutoverID string) ([]calendar.ImportRun, error) {
	latest := map[string]calendar.ImportRun{}
	for _, r := range s.Runs {
		if r.CutoverID == nil || *r.CutoverID != cutoverID || r.Status != calendar.RunSucceeded || r.FinishedAt == nil {
			continue
		}
		if cur, ok := latest[r.ExternalCalendarID]; !ok || r.FinishedAt.After(*cur.FinishedAt) {
			latest[r.ExternalCalendarID] = r
		}
	}
	out := make([]calendar.ImportRun, 0, len(latest))
	for _, r := range latest {
		out = append(out, r)
	}
	slices.SortFunc(out, func(a, b calendar.ImportRun) int { return strings.Compare(a.ExternalCalendarID, b.ExternalCalendarID) })
	return out, nil
}

// ReplaceSkips は、calendarimport.CutoverRepository の ReplaceSkips を実装する。
func (s Cutovers) ReplaceSkips(_ context.Context, cutoverID, externalCalendarID string, skips []calendarimport.CutoverSkip) error {
	s.CutoverSkips = slices.DeleteFunc(s.CutoverSkips, func(k calendarimport.CutoverSkip) bool {
		return k.CutoverID == cutoverID && k.ExternalCalendarID == externalCalendarID
	})
	s.CutoverSkips = append(s.CutoverSkips, skips...)
	return nil
}

// ListSkips は、calendarimport.CutoverRepository の ListSkips を実装する。
func (s Cutovers) ListSkips(_ context.Context, cutoverID, externalCalendarID string) ([]calendarimport.CutoverSkip, error) {
	var out []calendarimport.CutoverSkip
	for _, k := range s.CutoverSkips {
		if k.CutoverID == cutoverID && k.ExternalCalendarID == externalCalendarID {
			out = append(out, k)
		}
	}
	return out, nil
}

// ListLinks は、calendarimport.CutoverRepository の ListLinks を実装する。
func (s Cutovers) ListLinks(_ context.Context, cutoverID string) ([]calendar.EventLink, error) {
	var out []calendar.EventLink
	for _, l := range s.Links {
		if l.CutoverID != nil && *l.CutoverID == cutoverID {
			out = append(out, l)
		}
	}
	return out, nil
}

// CountPendingRecords は、calendarimport.CutoverRepository の CountPendingRecords を実装する。
func (s Cutovers) CountPendingRecords(_ context.Context, facilityID string) (int, error) {
	n := 0
	for _, r := range s.Records {
		if r.FacilityID == facilityID && r.Pending != nil {
			n++
		}
	}
	return n, nil
}

// ListRecordVisits は、calendarimport.CutoverRepository の ListRecordVisits を実装する。
func (s Cutovers) ListRecordVisits(_ context.Context, externalCalendarID string) (map[string]visit.Info, error) {
	out := map[string]visit.Info{}
	for _, r := range s.Records {
		if r.ExternalCalendarID != externalCalendarID || r.VisitInfoID == nil {
			continue
		}
		if i, ok := s.Infos[*r.VisitInfoID]; ok {
			out[r.ExternalEventID] = i
		}
	}
	return out, nil
}

// DeleteRecords は、calendarimport.CutoverRepository の DeleteRecords を実装する。
func (s Cutovers) DeleteRecords(ctx context.Context, facilityID string) error {
	var infos []string
	for id, r := range s.Records {
		if r.FacilityID != facilityID {
			continue
		}
		if r.VisitInfoID != nil {
			infos = append(infos, *r.VisitInfoID)
		}
		if r.Pending != nil && r.Pending.VisitInfoID != nil {
			infos = append(infos, *r.Pending.VisitInfoID)
		}
		delete(s.Records, id)
	}
	for _, id := range infos {
		if err := VisitInfos(s).DeleteIfUnused(ctx, id); err != nil {
			return err
		}
	}
	return nil
}

// DeleteImported は、calendarimport.CutoverRepository の DeleteImported を実装する。
func (s Cutovers) DeleteImported(_ context.Context, links []calendar.EventLink) error {
	recurring := map[string]bool{}
	for _, l := range links {
		delete(s.Links, l.ID)
		if l.ScheduleID != nil {
			s.deleteSchedule(*l.ScheduleID)
		}
		if l.RecurringScheduleID != nil {
			recurring[*l.RecurringScheduleID] = true
		}
	}
	for id, sc := range s.Schedules {
		if sc.RecurringScheduleID != nil && recurring[*sc.RecurringScheduleID] {
			s.deleteSchedule(id)
		}
	}
	for id := range recurring {
		if rs, ok := s.Recurring[id]; ok && rs.VisitInfoID != nil {
			delete(s.Infos, *rs.VisitInfoID)
		}
		delete(s.Recurring, id)
	}
	return nil
}

// deleteSchedule は、単発の予定 id と、その訪問の情報とキャンセルと予定の対応を消す。
func (s Cutovers) deleteSchedule(id string) {
	if sc, ok := s.Schedules[id]; ok && sc.VisitInfoID != nil {
		delete(s.Infos, *sc.VisitInfoID)
	}
	delete(s.Schedules, id)
	delete(s.Cancels, id)
	for lid, l := range s.Links {
		if l.ScheduleID != nil && *l.ScheduleID == id {
			delete(s.Links, lid)
		}
	}
}

// FindOpenCutover は、scheduleview.Cutovers の FindOpenCutover を実装する。
func (s Projections) FindOpenCutover(_ context.Context, facilityID string) (*scheduleview.OpenCutover, error) {
	for _, c := range s.Cutovers {
		if c.FacilityID == facilityID && c.Status == calendarimport.CutoverOpen {
			return &scheduleview.OpenCutover{StartedAt: c.StartedAt, RangeStart: c.RangeStart}, nil
		}
	}
	return nil, nil
}
