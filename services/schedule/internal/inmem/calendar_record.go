package inmem

import (
	"context"
	"slices"
	"strings"
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendar"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendarsync"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendarwrite"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
)

// CalendarEventRecords は、calendarwrite.RecordRepository と calendarsync.PendingRecords のメモリ上の実装である。
// ロックと lease を持たず、ClaimExpired は取るたびに、書く期限を過ぎた全ての保留の版を返す。
type CalendarEventRecords struct{ *Store }

var (
	_ calendarwrite.RecordRepository = CalendarEventRecords{}
	_ calendarsync.PendingRecords    = CalendarEventRecords{}
)

// ClaimExpired は、calendarsync.PendingRecords の ClaimExpired を実装する。書く期限の古い順に、同じなら予定の ID の順に返す。
func (s CalendarEventRecords) ClaimExpired(_ context.Context, now time.Time, max int, _ time.Duration,
	modes []organization.SourceMode) ([]calendarsync.PendingCheck, error) {
	var out []calendarsync.PendingCheck
	for _, r := range s.Records {
		c, ok := s.Calendars[r.PendingLocation().ExternalCalendarID]
		if r.Pending == nil || now.Before(r.Pending.Deadline) || !ok || !Syncs(s).synced(c, modes) {
			continue
		}
		out = append(out, calendarsync.PendingCheck{Record: copyRecord(r), Calendar: c})
	}
	slices.SortFunc(out, func(a, b calendarsync.PendingCheck) int {
		if c := a.Record.Pending.Deadline.Compare(b.Record.Pending.Deadline); c != 0 {
			return c
		}
		return strings.Compare(a.Record.ScheduleID, b.Record.ScheduleID)
	})
	return out[:min(max, len(out))], nil
}

// Release は、calendarsync.PendingRecords の Release を実装する。lease を持たないので何もしない。
func (s CalendarEventRecords) Release(context.Context, calendarsync.PendingCheck) error { return nil }

// GetForUpdate は、calendar.EventRecords の GetForUpdate を実装する。
func (s CalendarEventRecords) GetForUpdate(_ context.Context, scheduleID string) (calendar.EventRecord, error) {
	r, err := get(s.Records, scheduleID)
	return copyRecord(r), err
}

// FindAtForUpdate は、calendarwrite.RecordRepository の FindAtForUpdate を実装する。
func (s CalendarEventRecords) FindAtForUpdate(_ context.Context, at calendar.EventLocation) (calendar.EventRecord, bool, error) {
	for _, r := range s.Records {
		if r.Location() == at {
			return copyRecord(r), true, nil
		}
	}
	return calendar.EventRecord{}, false, nil
}

// Create は、calendarwrite.RecordRepository の Create を実装する。
func (s CalendarEventRecords) Create(_ context.Context, r calendar.EventRecord) error {
	for _, cur := range s.Records {
		if cur.ScheduleID == r.ScheduleID || (cur.ExternalCalendarID == r.ExternalCalendarID && cur.ExternalEventID == r.ExternalEventID) {
			return apperr.ErrConflict
		}
	}
	s.Records[r.ScheduleID] = copyRecord(r)
	return nil
}

// Update は、calendar.EventRecords の Update を実装する。
func (s CalendarEventRecords) Update(_ context.Context, r calendar.EventRecord) error {
	cur, err := get(s.Records, r.ScheduleID)
	if err != nil {
		return err
	}
	cur.ExternalCalendarID, cur.ExternalEventID = r.ExternalCalendarID, r.ExternalEventID
	cur.VisitInfoID, cur.Version, cur.Pending = r.VisitInfoID, r.Version, r.Pending
	s.Records[r.ScheduleID] = copyRecord(cur)
	return nil
}

// Delete は、calendar.EventRecords の Delete を実装する。
func (s CalendarEventRecords) Delete(_ context.Context, scheduleID string) error {
	delete(s.Records, scheduleID)
	return nil
}

// copyRecord は、保留の版を別の値にした r を返す。呼び出し側が読んだ記録の保留の版を変えても、保存した記録を変えないためである。
func copyRecord(r calendar.EventRecord) calendar.EventRecord {
	if r.Pending != nil {
		p := *r.Pending
		if p.MoveTo != nil {
			to := *p.MoveTo
			p.MoveTo = &to
		}
		r.Pending = &p
	}
	return r
}
