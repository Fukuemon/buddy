package inmem

import (
	"context"
	"slices"
	"strings"
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendar"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendarexport"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/schedule"
)

// Exports は、calendarexport.ExportRepository のメモリ上の実装である。時刻は time.Now で比べる。
type Exports struct{ *Store }

// open は、t の終わっていない待ちを返す。
func (s Exports) open(t calendar.Target) (calendar.Export, bool) {
	for _, e := range s.Exports {
		if e.Target == t && e.Status != calendar.ExportSucceeded {
			return e, true
		}
	}
	return calendar.Export{}, false
}

// Enqueue は、calendarexport.ExportRepository の Enqueue を実装する。
func (s Exports) Enqueue(_ context.Context, id string, t calendar.Target) error {
	e, ok := s.open(t)
	if !ok {
		now := time.Now()
		s.Exports[id] = calendar.Export{ID: id, Target: t, Status: calendar.ExportPending, Revision: 1, NextAttemptAt: now, CreatedAt: now}
		return nil
	}
	e.Revision++
	switch e.Status {
	case calendar.ExportFailed:
		e.Status, e.Attempts, e.ErrorCode, e.NextAttemptAt = calendar.ExportPending, 0, nil, time.Now()
	case calendar.ExportPending:
		e.NextAttemptAt = time.Now()
	}
	s.Exports[e.ID] = e
	return nil
}

// Claim は、書く時刻を過ぎた pending の待ちを ID の順に max 件まで返す。メモリ上の実装は lease を持たない。
func (s Exports) Claim(_ context.Context, max int, _ time.Duration) ([]calendar.Export, error) {
	var out []calendar.Export
	for _, e := range s.Exports {
		if e.Status == calendar.ExportPending && !e.NextAttemptAt.After(time.Now()) {
			out = append(out, e)
		}
	}
	slices.SortFunc(out, func(a, b calendar.Export) int { return strings.Compare(a.ID, b.ID) })
	out = out[:min(max, len(out))]
	for i := range out {
		out[i].Attempts++
		s.Exports[out[i].ID] = out[i]
	}
	return out, nil
}

// Finish は、待ちを書いた結果を書く。取り直された待ちは変えず、積み直された待ちは数え直す。
func (s Exports) Finish(_ context.Context, e calendar.Export, r calendar.ExportResult) error {
	cur, err := get(s.Exports, e.ID)
	if err != nil {
		return err
	}
	switch {
	case cur.Attempts != e.Attempts:
		return nil
	case r.Released:
		cur.Attempts--
	case cur.Revision != e.Revision:
		cur.Attempts, cur.Overwrite, cur.ErrorCode, cur.NextAttemptAt = 0, false, nil, time.Now()
	case r.Status == calendar.ExportSucceeded:
		cur.Status, cur.ErrorCode, cur.Overwrite = calendar.ExportSucceeded, nil, false
	default:
		cur.Status, cur.ErrorCode, cur.NextAttemptAt = r.Status, r.ErrorCode, time.Now().Add(r.RetryAfter)
	}
	s.Exports[e.ID] = cur
	return nil
}

// Get は、calendarexport.ExportRepository の Get を実装する。
func (s Exports) Get(_ context.Context, id string) (calendar.Export, error) {
	return get(s.Exports, id)
}

// ListIssues は、事業所の conflict と failed の待ちを、予定の日時と職員を付けて ID の順に返す。
func (s Exports) ListIssues(_ context.Context, facilityID string) ([]calendar.ExportIssue, error) {
	var out []calendar.ExportIssue
	for _, e := range s.Exports {
		if e.FacilityID != facilityID || (e.Status != calendar.ExportConflict && e.Status != calendar.ExportFailed) {
			continue
		}
		var slot schedule.Slot
		if e.ScheduleID != "" {
			slot = s.Schedules[e.ScheduleID].Slot
		} else {
			slot = s.Recurring[e.RecurringScheduleID].Slot
		}
		_, cancelled := s.Cancels[e.ScheduleID]
		out = append(out, calendar.ExportIssue{
			Export: e, Cancelled: cancelled, StaffID: slot.StaffID, StaffName: s.Staff[slot.StaffID].Username,
			Date: slot.Date, StartTime: slot.StartTime, EndTime: slot.EndTime,
		})
	}
	slices.SortFunc(out, func(a, b calendar.ExportIssue) int { return strings.Compare(a.ID, b.ID) })
	return out, nil
}

// Retry は、calendarexport.ExportRepository の Retry を実装する。
func (s Exports) Retry(_ context.Context, id string) error {
	e, err := get(s.Exports, id)
	if err != nil {
		return err
	}
	if e.Status != calendar.ExportConflict && e.Status != calendar.ExportFailed {
		return apperr.ErrConflict
	}
	e.Status, e.Overwrite, e.Attempts, e.ErrorCode, e.NextAttemptAt = calendar.ExportPending, true, 0, nil, time.Now()
	s.Exports[id] = e
	return nil
}

// Open は、t の終わっていない待ちを返す。無いときは apperr.ErrNotFound を返す。
func (s Exports) Open(_ context.Context, t calendar.Target) (calendar.Export, error) {
	if e, ok := s.open(t); ok {
		return e, nil
	}
	return calendar.Export{}, apperr.ErrNotFound
}

// Backlog は、calendarexport.ExportRepository の Backlog を実装する。
func (s Exports) Backlog(_ context.Context) (calendarexport.Backlog, error) {
	var b calendarexport.Backlog
	for _, e := range s.Exports {
		if e.Status != calendar.ExportPending {
			continue
		}
		b.PendingCount++
		b.OldestAge = max(b.OldestAge, time.Since(e.CreatedAt))
	}
	return b, nil
}
