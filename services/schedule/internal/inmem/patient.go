package inmem

import (
	"context"
	"slices"
	"strings"
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/patient"
)

// Patients は、patient.Repository のメモリ上の実装である。
type Patients struct{ *Store }

// Create は、patient.Repository の Create を実装する。
func (s Patients) Create(_ context.Context, p patient.Patient) error {
	s.Patients[p.ID] = patient.Detail{Patient: p}
	return nil
}

// Get は、patient.Repository の Get を実装する。
func (s Patients) Get(_ context.Context, id string) (patient.Detail, error) {
	return get(s.Patients, id)
}

// Update は、利用者の名前、希望、サービスコード、担当の職員を書き換える。利用の終了は変えない。
func (s Patients) Update(_ context.Context, p patient.Patient) error {
	d, ok := s.Patients[p.ID]
	if !ok {
		return apperr.ErrNotFound
	}
	p.EndedAt = d.EndedAt
	d.Patient = p
	s.Patients[p.ID] = d
	return nil
}

// End は、利用者を利用の終了にする。利用の終了の利用者では、最初に利用の終了にした時刻を残す。
func (s Patients) End(_ context.Context, id string) error {
	d, ok := s.Patients[id]
	if !ok {
		return apperr.ErrNotFound
	}
	if d.EndedAt == nil {
		now := time.Now()
		d.EndedAt = &now
	}
	s.Patients[id] = d
	return nil
}

// Resume は、patient.Repository の Resume を実装する。
func (s Patients) Resume(_ context.Context, id, assignedStaffID string) error {
	d, ok := s.Patients[id]
	if !ok {
		return apperr.ErrNotFound
	}
	d.EndedAt, d.AssignedStaffID = nil, assignedStaffID
	s.Patients[id] = d
	return nil
}

// ListByFacility は、事業所の利用者を ID の順に返す。q.IncludeEnded が false なら利用の終了の利用者を除く。ほかの絞り込みと並べ替えは使わない。
func (s Patients) ListByFacility(_ context.Context, facilityID string, q patient.ListQuery) ([]patient.Detail, error) {
	var out []patient.Detail
	for _, p := range s.Patients {
		if p.FacilityID == facilityID && (q.IncludeEnded || !p.IsEnded()) {
			out = append(out, p)
		}
	}
	slices.SortFunc(out, func(a, b patient.Detail) int { return strings.Compare(a.ID, b.ID) })
	return out, nil
}

// PatientSchedules は、patient.ScheduleReader のメモリ上の実装である。
type PatientSchedules struct{ *Store }

// From は、訪問の情報の利用者が patientID の、from 以降のキャンセルしていない予定と、from 以降に終わる繰り返しの予定を、ID の順に返す。
func (s PatientSchedules) From(_ context.Context, facilityID, patientID string, from civil.Date) (patient.Remaining, error) {
	visits := func(infoID *string) bool { return infoID != nil && s.Infos[*infoID].PatientID == patientID }
	var out patient.Remaining
	for id, d := range s.Schedules {
		if _, cancelled := s.Cancels[id]; cancelled || d.FacilityID != facilityID || d.Date.Before(from) || !visits(d.VisitInfoID) {
			continue
		}
		out.Schedules = append(out.Schedules, patient.RemainingSchedule{ID: id, Date: d.Date, StartTime: d.StartTime, EndTime: d.EndTime})
	}
	for id, d := range s.Recurring {
		if d.FacilityID != facilityID || (d.Rule.EndDate != nil && d.Rule.EndDate.Before(from)) || !visits(d.VisitInfoID) {
			continue
		}
		out.RecurringSchedules = append(out.RecurringSchedules, patient.RemainingRecurring{ID: id, Date: d.Date, EndDate: d.Rule.EndDate, StartTime: d.StartTime, EndTime: d.EndTime})
	}
	slices.SortFunc(out.Schedules, func(a, b patient.RemainingSchedule) int { return strings.Compare(a.ID, b.ID) })
	slices.SortFunc(out.RecurringSchedules, func(a, b patient.RemainingRecurring) int { return strings.Compare(a.ID, b.ID) })
	return out, nil
}
