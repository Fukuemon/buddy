package inmem

import (
	"cmp"
	"context"
	"maps"
	"slices"
	"strings"
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendar"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/scheduleview"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/visit"
)

// ProjectionKey は、Projections の行のキーで、結び付けたカレンダーの ID と Google の予定の ID の組である。
type ProjectionKey struct{ ExternalCalendarID, EventID string }

// Projections は、calendarsync.Projections のメモリ上の実装である。
type Projections struct{ *Store }

// Put は、calendarsync.Projections の Put を実装する。写した時刻は今の時刻にする。
func (s Projections) Put(_ context.Context, p scheduleview.Projection) error {
	k := ProjectionKey{p.ExternalCalendarID, p.EventID}
	if old, ok := s.Projections[k]; ok && old.GoogleUpdatedAt != nil && (p.GoogleUpdatedAt == nil || !p.GoogleUpdatedAt.After(*old.GoogleUpdatedAt)) {
		return nil
	}
	p.ProjectedAt = time.Now()
	s.Projections[k] = p
	return nil
}

// CancelOccurrences は、calendarsync.Projections の CancelOccurrences を実装する。
func (s Projections) CancelOccurrences(_ context.Context, externalCalendarID, parentEventID string) error {
	for k, p := range s.Projections {
		if k.ExternalCalendarID != externalCalendarID || p.RecurringEventID != parentEventID || p.Status == scheduleview.ProjectionCancelled {
			continue
		}
		p.Status, p.Title, p.Start, p.End, p.TimeZone = scheduleview.ProjectionCancelled, "", scheduleview.ProjectionTime{}, scheduleview.ProjectionTime{}, ""
		p.ProjectedAt = time.Now()
		s.Projections[k] = p
	}
	return nil
}

// Delete は、calendarsync.Projections の Delete を実装する。
func (s Projections) Delete(_ context.Context, externalCalendarID, eventID string) error {
	maps.DeleteFunc(s.Projections, func(k ProjectionKey, p scheduleview.Projection) bool {
		return k.ExternalCalendarID == externalCalendarID && (k.EventID == eventID || p.RecurringEventID == eventID)
	})
	return nil
}

// DeleteExcept は、calendarsync.Projections の DeleteExcept を実装する。
func (s Projections) DeleteExcept(_ context.Context, externalCalendarID string, eventIDs []string) error {
	maps.DeleteFunc(s.Projections, func(k ProjectionKey, _ scheduleview.Projection) bool {
		return k.ExternalCalendarID == externalCalendarID && !slices.Contains(eventIDs, k.EventID)
	})
	return nil
}

// DeleteEndedBefore は、calendarsync.Projections の DeleteEndedBefore を実装する。
func (s Projections) DeleteEndedBefore(_ context.Context, externalCalendarID string, before civil.Date) error {
	maps.DeleteFunc(s.Projections, func(k ProjectionKey, p scheduleview.Projection) bool {
		return k.ExternalCalendarID == externalCalendarID && p.LastEndDate != nil && p.LastEndDate.Before(before)
	})
	return nil
}

// ListByFacility は、scheduleview.Projections の ListByFacility を実装する。行は、カレンダーの ID と Google の予定の ID の順に返す。
func (s Projections) ListByFacility(_ context.Context, facilityID string, from civil.Date) ([]scheduleview.ProjectionDetail, error) {
	var out []scheduleview.ProjectionDetail
	for _, p := range s.Projections {
		c, ok := s.Calendars[p.ExternalCalendarID]
		if p.FacilityID != facilityID || !ok || c.FacilityID != facilityID || c.DisabledAt != nil || (p.LastEndDate != nil && p.LastEndDate.Before(from)) {
			continue
		}
		out = append(out, s.detail(p))
	}
	slices.SortFunc(out, func(a, b scheduleview.ProjectionDetail) int {
		return cmp.Or(strings.Compare(a.ExternalCalendarID, b.ExternalCalendarID), strings.Compare(a.EventID, b.EventID))
	})
	return out, nil
}

// GetBySchedule は、scheduleview.Projections の GetBySchedule を実装する。
// postgres の実装と同じく、記録の予定の ID なら記録が指す行を、ほかの行より先に返す。
func (s Projections) GetBySchedule(_ context.Context, facilityID, id string) (scheduleview.ProjectionDetail, error) {
	if r, ok := s.Records[id]; ok {
		p, ok := s.Projections[ProjectionKey{ExternalCalendarID: r.ExternalCalendarID, EventID: r.ExternalEventID}]
		if c, cok := s.Calendars[p.ExternalCalendarID]; ok && cok && p.FacilityID == facilityID && c.FacilityID == facilityID && c.DisabledAt == nil {
			return s.detail(p), nil
		}
	}
	for _, p := range s.Projections {
		c, ok := s.Calendars[p.ExternalCalendarID]
		if p.FacilityID != facilityID || !ok || c.FacilityID != facilityID || c.DisabledAt != nil {
			continue
		}
		if d := s.detail(p); d.ScheduleID == id {
			return d, nil
		}
	}
	return scheduleview.ProjectionDetail{}, apperr.ErrNotFound
}

// detail は、行 p に、職員の名前と、一覧での予定の ID と、記録の確定した版の訪問の情報を付ける。
// 例外の回の行で、回の記録が無いか確定した版を持たないときは、親の予定の記録の確定した版の訪問の情報を付ける。
// 記録の無い例外の回の行の一覧での ID は、展開した回と同じ scheduleview.OccurrenceScheduleID にし、その値がほかの予定を指す記録の主キーなら
// scheduleview.DetachedOccurrenceScheduleID にする。
func (s Projections) detail(p scheduleview.Projection) scheduleview.ProjectionDetail {
	d := scheduleview.ProjectionDetail{Projection: p, StaffName: s.Staff[p.StaffID].Username}
	confirmed := false
	if r, ok := s.recordAt(p.ExternalCalendarID, p.EventID); ok {
		d.ScheduleID, d.Visit, confirmed = r.ScheduleID, s.visitOf(r.VisitInfoID), r.Version > 0
	} else if d0, ok := p.OriginalDate(); ok && p.IsException() {
		d.ScheduleID = scheduleview.OccurrenceScheduleID(p.ExternalCalendarID, p.RecurringEventID, d0)
		if _, taken := s.Records[d.ScheduleID]; taken {
			d.ScheduleID = scheduleview.DetachedOccurrenceScheduleID(p.ExternalCalendarID, p.RecurringEventID, d0)
		}
	} else {
		_, taken := s.Records[scheduleview.ProjectedScheduleID(p.ExternalCalendarID, p.EventID)]
		d.ScheduleID = scheduleview.ListScheduleID(p.ExternalCalendarID, p.EventID, taken)
	}
	if parent, ok := s.recordAt(p.ExternalCalendarID, p.RecurringEventID); ok && !confirmed && p.IsException() {
		d.Visit = s.visitOf(parent.VisitInfoID)
	}
	return d
}

func (s Projections) recordAt(externalCalendarID, eventID string) (calendar.EventRecord, bool) {
	for _, r := range s.Records {
		if r.ExternalCalendarID == externalCalendarID && r.ExternalEventID == eventID {
			return r, true
		}
	}
	return calendar.EventRecord{}, false
}

func (s Projections) visitOf(id *string) *visit.Detail {
	if id == nil {
		return nil
	}
	v, err := VisitInfos(s).GetDetail(context.Background(), *id)
	if err != nil {
		return nil
	}
	return &v
}

// ListSyncsByFacility は、scheduleview.CalendarSyncs の ListSyncsByFacility を実装する。SyncResults と SyncedAt から作る。
func (s Projections) ListSyncsByFacility(_ context.Context, facilityID string) ([]scheduleview.CalendarSync, error) {
	var out []scheduleview.CalendarSync
	for _, c := range s.Calendars {
		if c.FacilityID != facilityID || c.DisabledAt != nil {
			continue
		}
		cs := scheduleview.CalendarSync{ExternalCalendarID: c.ID, StaffID: c.StaffID, StaffName: s.Staff[c.StaffID].Username, LastStatus: scheduleview.SyncNever}
		if r, ok := s.SyncResults[c.ID]; ok {
			cs.LastStatus = scheduleview.SyncStatus(r.Status)
			if r.ErrorCode != nil {
				code := string(*r.ErrorCode)
				cs.LastError = &code
			}
		}
		if at, ok := s.SyncedAt[c.ID]; ok {
			cs.LastSucceededAt = &at
		}
		out = append(out, cs)
	}
	slices.SortFunc(out, func(a, b scheduleview.CalendarSync) int {
		return strings.Compare(a.ExternalCalendarID, b.ExternalCalendarID)
	})
	return out, nil
}
