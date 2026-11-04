package inmem

import (
	"context"
	"slices"
	"strings"
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendar"
)

// Calendars は、calendar.Repository、calendarimport.Calendars、calendarsync.Calendars、calendarexport.ExportCalendars と calendarexport.ExporterCalendars のメモリ上の実装である。ロックは取らない。
type Calendars struct{ *Store }

// Get は、外したものも含めてカレンダーを返す。
func (s Calendars) Get(_ context.Context, id string) (calendar.ExternalCalendar, error) {
	return get(s.Calendars, id)
}

// GetForUpdate は、Get と同じ値を返す。
func (s Calendars) GetForUpdate(ctx context.Context, id string) (calendar.ExternalCalendar, error) {
	return s.Get(ctx, id)
}

// FindByCalendarID は、calendar.Repository の FindByCalendarID を実装する。
func (s Calendars) FindByCalendarID(_ context.Context, provider, calendarID string) (calendar.ExternalCalendar, error) {
	for _, c := range s.Calendars {
		if c.Provider == provider && c.CalendarID == calendarID {
			return c, nil
		}
	}
	return calendar.ExternalCalendar{}, apperr.ErrNotFound
}

// ListByFacility は、事業所の外していないカレンダーを、最も新しく始めた取り込みを付けて ID の順に返す。
func (s Calendars) ListByFacility(_ context.Context, facilityID string) ([]calendar.ExternalCalendar, error) {
	var out []calendar.ExternalCalendar
	for _, c := range s.Calendars {
		if c.FacilityID != facilityID || c.DisabledAt != nil {
			continue
		}
		for _, r := range s.Runs {
			if r.ExternalCalendarID == c.ID && (c.LastImport == nil || r.StartedAt.After(c.LastImport.StartedAt)) {
				run := r
				c.LastImport = &run
			}
		}
		out = append(out, c)
	}
	slices.SortFunc(out, func(a, b calendar.ExternalCalendar) int { return strings.Compare(a.ID, b.ID) })
	return out, nil
}

// hasActiveCalendar は、職員に外していないカレンダーがあるかを返す。
func (s Calendars) hasActiveCalendar(staffID, exceptID string) bool {
	for _, c := range s.Calendars {
		if c.StaffID == staffID && c.DisabledAt == nil && c.ID != exceptID {
			return true
		}
	}
	return false
}

// Create は、カレンダーを保存する。職員に外していないカレンダーがあるか、同じカレンダーがあるときは apperr.ErrConflict を返す。
func (s Calendars) Create(ctx context.Context, c calendar.ExternalCalendar) error {
	if _, err := s.FindByCalendarID(ctx, c.Provider, c.CalendarID); err == nil || s.hasActiveCalendar(c.StaffID, "") {
		return apperr.ErrConflict
	}
	s.Calendars[c.ID] = c
	return nil
}

// Enable は、外したカレンダーを結び付け直す。職員に外していないカレンダーがあるときは apperr.ErrConflict を返す。
func (s Calendars) Enable(_ context.Context, id string) error {
	c := s.Calendars[id]
	if s.hasActiveCalendar(c.StaffID, id) {
		return apperr.ErrConflict
	}
	c.DisabledAt = nil
	s.Calendars[id] = c
	return nil
}

// Disable は、calendar.Repository の Disable を実装する。
func (s Calendars) Disable(_ context.Context, id string) error {
	c := s.Calendars[id]
	if c.DisabledAt == nil {
		now := time.Now()
		c.DisabledAt = &now
		s.Calendars[id] = c
	}
	return nil
}

// DetachByStaff は、staff.CalendarDetacher の DetachByStaff を実装する。
func (s Calendars) DetachByStaff(ctx context.Context, staffID string) error {
	for id, c := range s.Calendars {
		if c.StaffID == staffID {
			if err := s.Disable(ctx, id); err != nil {
				return err
			}
		}
	}
	return nil
}

// RunningSince は、calendarimport.Calendars の RunningSince を実装する。
func (s Calendars) RunningSince(_ context.Context, externalCalendarID string, since time.Time) (bool, error) {
	for _, r := range s.Runs {
		if r.ExternalCalendarID == externalCalendarID && r.Status == calendar.RunRunning && r.StartedAt.After(since) {
			return true, nil
		}
	}
	return false, nil
}

// CreateRun は、calendarimport.Calendars の CreateRun を実装する。
func (s Calendars) CreateRun(_ context.Context, r calendar.ImportRun) error {
	r.StartedAt = time.Now()
	s.Runs[r.ID] = r
	return nil
}

// FinishRun は、calendarimport.Calendars の FinishRun を実装する。
func (s Calendars) FinishRun(_ context.Context, r calendar.ImportRun) (calendar.ImportRun, error) {
	cur, err := get(s.Runs, r.ID)
	if err != nil {
		return calendar.ImportRun{}, err
	}
	now := time.Now()
	cur.Status, cur.ImportedCount, cur.SkippedCount, cur.FinishedAt = r.Status, r.ImportedCount, r.SkippedCount, &now
	s.Runs[r.ID] = cur
	return cur, nil
}

// ListLinks は、calendarimport.Calendars と calendarexport.ExporterCalendars の ListLinks を実装する。
func (s Calendars) ListLinks(_ context.Context, externalCalendarID string) ([]calendar.EventLink, error) {
	var out []calendar.EventLink
	for _, l := range s.Links {
		if l.ExternalCalendarID == externalCalendarID {
			out = append(out, l)
		}
	}
	return out, nil
}

// CreateLink は、予定の対応を保存する。同じ外部の予定の対応があるときは apperr.ErrConflict を返す。
func (s Calendars) CreateLink(_ context.Context, l calendar.EventLink) error {
	for _, cur := range s.Links {
		if cur.ExternalCalendarID == l.ExternalCalendarID && cur.ExternalEventID == l.ExternalEventID {
			return apperr.ErrConflict
		}
	}
	s.Links[l.ID] = l
	return nil
}

// ActiveByStaff は、calendarexport.ExportCalendars の ActiveByStaff を実装する。
func (s Calendars) ActiveByStaff(_ context.Context, staffID string) (calendar.ExternalCalendar, error) {
	for _, c := range s.Calendars {
		if c.StaffID == staffID && c.DisabledAt == nil {
			return c, nil
		}
	}
	return calendar.ExternalCalendar{}, apperr.ErrNotFound
}

// LinkBySchedule は、calendarsync.Calendars と calendarexport.ExportCalendars の LinkBySchedule を実装する。
func (s Calendars) LinkBySchedule(_ context.Context, scheduleID string) (calendar.EventLink, error) {
	return s.linkBy(func(l calendar.EventLink) *string { return l.ScheduleID }, scheduleID)
}

// LinkByRecurringSchedule は、calendarexport.ExportCalendars の LinkByRecurringSchedule を実装する。
func (s Calendars) LinkByRecurringSchedule(_ context.Context, recurringScheduleID string) (calendar.EventLink, error) {
	return s.linkBy(func(l calendar.EventLink) *string { return l.RecurringScheduleID }, recurringScheduleID)
}

// LinkByEvent は、calendarsync.Calendars の LinkByEvent を実装する。
func (s Calendars) LinkByEvent(_ context.Context, externalCalendarID, eventID string) (calendar.EventLink, error) {
	for _, l := range s.Links {
		if l.ExternalCalendarID == externalCalendarID && l.ExternalEventID == eventID {
			return l, nil
		}
	}
	return calendar.EventLink{}, apperr.ErrNotFound
}

func (s Calendars) linkBy(target func(calendar.EventLink) *string, id string) (calendar.EventLink, error) {
	for _, l := range s.Links {
		if t := target(l); t != nil && *t == id {
			return l, nil
		}
	}
	return calendar.EventLink{}, apperr.ErrNotFound
}

// UpdateLink は、calendarsync.Calendars と calendarexport.ExporterCalendars の UpdateLink を実装する。
func (s Calendars) UpdateLink(_ context.Context, id, etag string, version int) error {
	l, err := get(s.Links, id)
	if err != nil {
		return err
	}
	l.ETag, l.SyncedVersion = etag, &version
	s.Links[id] = l
	return nil
}

// DeleteLink は、calendarexport.ExporterCalendars の DeleteLink を実装する。
func (s Calendars) DeleteLink(_ context.Context, id string) error {
	delete(s.Links, id)
	return nil
}
