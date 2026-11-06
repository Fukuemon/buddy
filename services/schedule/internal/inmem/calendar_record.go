package inmem

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendarwrite"
)

// CalendarEventRecords は、calendarwrite.RecordRepository のメモリ上の実装である。ロックは取らない。
type CalendarEventRecords struct{ *Store }

var _ calendarwrite.RecordRepository = CalendarEventRecords{}

// GetForUpdate は、calendarwrite.RecordRepository の GetForUpdate を実装する。
func (s CalendarEventRecords) GetForUpdate(_ context.Context, scheduleID string) (calendarwrite.Record, error) {
	r, err := get(s.Records, scheduleID)
	return copyRecord(r), err
}

// Create は、calendarwrite.RecordRepository の Create を実装する。
func (s CalendarEventRecords) Create(_ context.Context, r calendarwrite.Record) error {
	for _, cur := range s.Records {
		if cur.ScheduleID == r.ScheduleID || (cur.ExternalCalendarID == r.ExternalCalendarID && cur.ExternalEventID == r.ExternalEventID) {
			return apperr.ErrConflict
		}
	}
	s.Records[r.ScheduleID] = copyRecord(r)
	return nil
}

// Update は、calendarwrite.RecordRepository の Update を実装する。
func (s CalendarEventRecords) Update(_ context.Context, r calendarwrite.Record) error {
	cur, err := get(s.Records, r.ScheduleID)
	if err != nil {
		return err
	}
	cur.VisitInfoID, cur.Version, cur.Pending = r.VisitInfoID, r.Version, r.Pending
	s.Records[r.ScheduleID] = copyRecord(cur)
	return nil
}

// Delete は、calendarwrite.RecordRepository の Delete を実装する。
func (s CalendarEventRecords) Delete(_ context.Context, scheduleID string) error {
	delete(s.Records, scheduleID)
	return nil
}

// copyRecord は、保留の版を別の値にした r を返す。呼び出し側が読んだ記録の保留の版を変えても、保存した記録を変えないためである。
func copyRecord(r calendarwrite.Record) calendarwrite.Record {
	if r.Pending != nil {
		p := *r.Pending
		r.Pending = &p
	}
	return r
}
