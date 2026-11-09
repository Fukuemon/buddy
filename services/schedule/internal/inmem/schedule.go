package inmem

import (
	"context"
	"slices"
	"strings"
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendar"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/schedule"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/scheduleview"
)

// ScheduleTypes は、schedule.TypeRepository のメモリ上の実装である。
type ScheduleTypes struct{ *Store }

// Get は、schedule.TypeRepository の Get を実装する。
func (s ScheduleTypes) Get(_ context.Context, id string) (schedule.Type, error) {
	return get(s.Types, id)
}

// List は、予定の種類を ID の順に返す。
func (s ScheduleTypes) List(context.Context) ([]schedule.Type, error) {
	out := make([]schedule.Type, 0, len(s.Types))
	for _, t := range s.Types {
		out = append(out, t)
	}
	slices.SortFunc(out, func(a, b schedule.Type) int { return strings.Compare(a.ID, b.ID) })
	return out, nil
}

// Schedules は、schedule.Repository と scheduleview.Schedules のメモリ上の実装である。
type Schedules struct{ *Store }

// Create は、schedule.Repository の Create を実装する。
func (s Schedules) Create(_ context.Context, sc schedule.Schedule) error {
	for _, d := range s.Deletions {
		if d.ScheduleID == sc.ID {
			return apperr.ErrConflict
		}
	}
	s.Schedules[sc.ID] = scheduleview.Detail{Schedule: sc, TypeName: s.Types[sc.TypeID].Name, Version: 1}
	return nil
}

// GetForUpdate は、単発の予定を、名前を結合しない書き込みのモデルで返す。メモリ上の実装はロックを取らない。
func (s Schedules) GetForUpdate(_ context.Context, id string) (schedule.Stored, error) {
	d, err := get(s.Schedules, id)
	if err != nil {
		return schedule.Stored{}, err
	}
	_, cancelled := s.Cancels[id]
	return schedule.Stored{Schedule: d.Schedule, Visit: s.info(d.VisitInfoID), Cancelled: cancelled, Version: d.Version}, nil
}

// Update は、単発の予定を置き換える。繰り返しの予定と元の回の日付は前のままにする。
func (s Schedules) Update(_ context.Context, sc schedule.Schedule) error {
	cur, ok := s.Schedules[sc.ID]
	if !ok {
		return apperr.ErrNotFound
	}
	sc.RecurringScheduleID = cur.RecurringScheduleID
	sc.OriginalDate = cur.OriginalDate
	s.Schedules[sc.ID] = scheduleview.Detail{Schedule: sc, TypeName: s.Types[sc.TypeID].Name, Version: cur.Version + 1}
	return nil
}

// Get は、単発の予定と、あれば訪問の情報とキャンセルを返す。訪問の情報は、ID と職員と利用者とサービスコードだけを持つ。
func (s Schedules) Get(_ context.Context, id string) (scheduleview.Detail, error) {
	d, err := get(s.Schedules, id)
	d.Visit = s.visit(d.VisitInfoID)
	if c, ok := s.Cancels[id]; ok {
		d.Cancel = &c
	}
	return d, err
}

// ListByFacility は、scheduleview.Schedules の ListByFacility を実装する。
func (s Schedules) ListByFacility(_ context.Context, facilityID string, _ scheduleview.ListQuery) ([]scheduleview.Detail, error) {
	var out []scheduleview.Detail
	for _, d := range s.Schedules {
		if d.FacilityID == facilityID {
			out = append(out, d)
		}
	}
	return out, nil
}

// CreateCancel は、キャンセルを保存する。キャンセル済みなら apperr.ErrConflict を返す。
func (s Schedules) CreateCancel(_ context.Context, c schedule.Cancellation) error {
	if _, ok := s.Cancels[c.ScheduleID]; ok {
		return apperr.ErrConflict
	}
	s.Cancels[c.ScheduleID] = c
	d := s.Schedules[c.ScheduleID]
	d.Version++
	s.Schedules[c.ScheduleID] = d
	return nil
}

// Delete は、schedule.Repository の Delete を実装する。終わっていない書き出しの待ちは削除の待ちに付け替え、終わった待ちは ON DELETE CASCADE と同じく消す。
func (s Schedules) Delete(_ context.Context, d schedule.Deletion) error {
	sc, ok := s.Schedules[d.ScheduleID]
	if !ok {
		return apperr.ErrNotFound
	}
	s.Deletions = append(s.Deletions, d)
	for id, l := range s.Links {
		if l.ScheduleID != nil && *l.ScheduleID == d.ScheduleID {
			l.ScheduleID, l.DeletedScheduleID = nil, &d.ScheduleID
			s.Links[id] = l
		}
	}
	for id, e := range s.Exports {
		switch {
		case e.ScheduleID != d.ScheduleID:
		case e.Status == calendar.ExportSucceeded:
			delete(s.Exports, id)
		default:
			if e.Status != calendar.ExportPending || e.LockedUntil == nil || !e.LockedUntil.After(time.Now()) {
				e.Attempts = 0
			}
			e.ScheduleID, e.DeletedScheduleID, e.Status, e.ErrorCode, e.NextAttemptAt = "", d.ScheduleID, calendar.ExportPending, nil, time.Now()
			e.Revision++
			s.Exports[id] = e
		}
	}
	delete(s.Schedules, d.ScheduleID)
	if sc.VisitInfoID != nil {
		delete(s.Infos, *sc.VisitInfoID)
	}
	return nil
}

// StaffOfDeleted は、calendarexport.DeletedSchedules を実装する。
func (s Schedules) StaffOfDeleted(_ context.Context, scheduleID string) (string, error) {
	for _, d := range s.Deletions {
		if d.ScheduleID == scheduleID {
			return d.StaffID, nil
		}
	}
	return "", apperr.ErrNotFound
}

// ReplacementOf は、繰り返しの予定の d の回を置き換えた単発の予定を、名前を結合しない書き込みのモデルで返す。
func (s Schedules) ReplacementOf(ctx context.Context, recurringScheduleID string, d civil.Date) (schedule.Stored, error) {
	for id, sc := range s.Schedules {
		if sc.RecurringScheduleID != nil && *sc.RecurringScheduleID == recurringScheduleID && sc.OriginalDate != nil && *sc.OriginalDate == d {
			return s.GetForUpdate(ctx, id)
		}
	}
	return schedule.Stored{}, apperr.ErrNotFound
}

// RecurringSchedules は、schedule.RecurringRepository と scheduleview.RecurringSchedules のメモリ上の実装である。
type RecurringSchedules struct{ *Store }

// Create は、schedule.RecurringRepository の Create を実装する。
func (s RecurringSchedules) Create(_ context.Context, rs schedule.RecurringSchedule) error {
	s.Recurring[rs.ID] = scheduleview.RecurringDetail{RecurringSchedule: rs, TypeName: s.Types[rs.TypeID].Name, Version: 1}
	return nil
}

// GetForUpdate は、繰り返しの予定を、名前を結合しない書き込みのモデルで返す。メモリ上の実装はロックを取らない。
func (s RecurringSchedules) GetForUpdate(_ context.Context, id string) (schedule.StoredRecurring, error) {
	d, err := get(s.Recurring, id)
	if err != nil {
		return schedule.StoredRecurring{}, err
	}
	return schedule.StoredRecurring{RecurringSchedule: d.RecurringSchedule, Visit: s.info(d.VisitInfoID), Version: d.Version}, nil
}

// Get は、繰り返しの予定と、あれば訪問の情報を返す。訪問の情報は、Schedules.Get と同じ項目だけを持つ。
func (s RecurringSchedules) Get(_ context.Context, id string) (scheduleview.RecurringDetail, error) {
	d, err := get(s.Recurring, id)
	d.Visit = s.visit(d.VisitInfoID)
	return d, err
}

// ListByFacility は、scheduleview.RecurringSchedules の ListByFacility を実装する。
func (s RecurringSchedules) ListByFacility(_ context.Context, facilityID string, _ scheduleview.ListQuery) ([]scheduleview.RecurringDetail, error) {
	var out []scheduleview.RecurringDetail
	for _, d := range s.Recurring {
		if d.FacilityID == facilityID {
			out = append(out, d)
		}
	}
	return out, nil
}

// UpdateRule は、schedule.RecurringRepository の UpdateRule を実装する。
func (s RecurringSchedules) UpdateRule(_ context.Context, rs schedule.RecurringSchedule) error {
	d, ok := s.Recurring[rs.ID]
	if !ok {
		return nil
	}
	d.Date = rs.Date
	d.Rule = rs.Rule
	d.Version++
	s.Recurring[rs.ID] = d
	return nil
}

// RemoveUnreplacedExclusions は、schedule.RecurringRepository の RemoveUnreplacedExclusions を実装する。
func (s RecurringSchedules) RemoveUnreplacedExclusions(_ context.Context, id string, from civil.Date) error {
	d, ok := s.Recurring[id]
	if !ok {
		return nil
	}
	replaced := map[civil.Date]bool{}
	for _, sc := range s.Schedules {
		if sc.RecurringScheduleID != nil && *sc.RecurringScheduleID == id && sc.OriginalDate != nil {
			replaced[*sc.OriginalDate] = true
		}
	}
	kept := []civil.Date{}
	for _, e := range d.ExclusionDates {
		if e.Before(from) || replaced[e] {
			kept = append(kept, e)
		}
	}
	d.ExclusionDates = kept
	s.Recurring[id] = d
	return nil
}

// ReplacedDates は、schedule.RecurringRepository の ReplacedDates を実装する。
func (s RecurringSchedules) ReplacedDates(_ context.Context, id string, from civil.Date) ([]civil.Date, error) {
	var out []civil.Date
	for _, sc := range s.Schedules {
		if sc.RecurringScheduleID != nil && *sc.RecurringScheduleID == id && sc.OriginalDate != nil && !sc.OriginalDate.Before(from) {
			out = append(out, *sc.OriginalDate)
		}
	}
	slices.SortFunc(out, func(a, b civil.Date) int { return a.Time().Compare(b.Time()) })
	return out, nil
}

// AddExclusion は、繰り返しの予定から d の回を除外する。除外済みなら apperr.ErrConflict を返す。
func (s RecurringSchedules) AddExclusion(_ context.Context, id string, d civil.Date) error {
	rs := s.Recurring[id]
	for _, e := range rs.ExclusionDates {
		if e == d {
			return apperr.ErrConflict
		}
	}
	rs.ExclusionDates = append(rs.ExclusionDates, d)
	rs.Version++
	s.Recurring[id] = rs
	return nil
}

// DeleteOccurrence は、schedule.RecurringRepository の DeleteOccurrence を実装する。
func (s RecurringSchedules) DeleteOccurrence(ctx context.Context, d schedule.Deletion) error {
	if err := s.AddExclusion(ctx, d.RecurringScheduleID, d.Date); err != nil {
		return err
	}
	s.Deletions = append(s.Deletions, d)
	return nil
}
