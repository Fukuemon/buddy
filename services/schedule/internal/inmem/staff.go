package inmem

import (
	"context"
	"slices"
	"strings"
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/schedule"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/staff"
)

// Staff は、staff.Repository のメモリ上の実装である。
type Staff struct{ *Store }

// Create は、職員と権限を保存する。同じ事業所にメールが完全に一致する職員がいれば apperr.ErrConflict を返す。
// DB の検査の制約と同じく、小文字にそろえていないメールは入力のエラーにする。
func (s Staff) Create(_ context.Context, st staff.Staff, grants []staff.Grant) error {
	if st.Email != strings.ToLower(st.Email) {
		return apperr.Invalid("値がカラムの制約に合いません")
	}
	for _, cur := range s.Staff {
		if cur.FacilityID == st.FacilityID && cur.Email == st.Email {
			return apperr.ErrConflict
		}
	}
	s.Staff[st.ID] = staff.Detail{Summary: staff.Summary{Staff: st}}
	s.Grants[st.ID] = grants
	return nil
}

// ChangePosition は、職員の役職を替え、権限を grants に置き換える。
func (s Staff) ChangePosition(_ context.Context, id, positionID string, grants []staff.Grant) error {
	d, ok := s.Staff[id]
	if !ok {
		return apperr.ErrNotFound
	}
	d.PositionID = positionID
	d.Policies = nil
	s.Staff[id] = d
	s.Grants[id] = grants
	return nil
}

// UpdateProfile は、職員の名前、電話番号、部署、チーム、訪問しない職員かを p にし、Grants と職員の Policies のうち oldTeamID を指す対象を
// p.TeamID に移す。同じ権限が p.TeamID を既に対象にしていれば、oldTeamID の対象を消す。退職した職員なら apperr.ErrConflict を返す。
func (s Staff) UpdateProfile(_ context.Context, id string, p staff.Profile, oldTeamID string) error {
	d, ok := s.Staff[id]
	switch {
	case !ok:
		return apperr.ErrNotFound
	case d.RetiredAt != nil:
		return apperr.ErrConflict
	}
	d.Username, d.PhoneNumber, d.DepartmentID, d.TeamID, d.NonVisiting = p.Username, p.PhoneNumber, p.DepartmentID, p.TeamID, p.NonVisiting
	if oldTeamID != p.TeamID {
		for i, g := range d.Policies {
			if slices.Contains(g.TargetTeamIDs, oldTeamID) {
				teams := slices.DeleteFunc(slices.Clone(g.TargetTeamIDs), func(t string) bool { return t == oldTeamID || t == p.TeamID })
				d.Policies[i].TargetTeamIDs = append(teams, p.TeamID)
			}
		}
		for i, g := range s.Grants[id] {
			covered := slices.ContainsFunc(g.Targets, func(t staff.Target) bool { return t.TeamID == p.TeamID })
			var targets []staff.Target
			for _, t := range g.Targets {
				if t.TeamID == oldTeamID {
					if covered {
						continue
					}
					t.TeamID = p.TeamID
				}
				targets = append(targets, t)
			}
			s.Grants[id][i].Targets = targets
		}
	}
	s.Staff[id] = d
	return nil
}

// AddGrant は、職員の権限に g を足す。同じ権限が Grants か職員の Policies にあれば apperr.ErrConflict を返す。
func (s Staff) AddGrant(_ context.Context, id string, g staff.Grant) error {
	d, ok := s.Staff[id]
	if !ok {
		return apperr.ErrNotFound
	}
	for _, cur := range s.Grants[id] {
		if cur.PolicyID == g.PolicyID {
			return apperr.ErrConflict
		}
	}
	for _, p := range d.Policies {
		if p.PolicyID == g.PolicyID {
			return apperr.ErrConflict
		}
	}
	s.Grants[id] = append(s.Grants[id], g)
	return nil
}

// RemoveGrant は、職員の権限 userPolicyID を、Grants か職員の Policies から外す。無ければ apperr.ErrNotFound を返す。
func (s Staff) RemoveGrant(_ context.Context, id, userPolicyID string) error {
	d, ok := s.Staff[id]
	if !ok {
		return apperr.ErrNotFound
	}
	for i, g := range s.Grants[id] {
		if g.ID == userPolicyID {
			s.Grants[id] = append(s.Grants[id][:i], s.Grants[id][i+1:]...)
			return nil
		}
	}
	for i, p := range d.Policies {
		if p.UserPolicyID == userPolicyID {
			d.Policies = append(d.Policies[:i:i], d.Policies[i+1:]...)
			s.Staff[id] = d
			return nil
		}
	}
	return apperr.ErrNotFound
}

// Get は、staff.Repository の Get を実装する。
func (s Staff) Get(_ context.Context, id string) (staff.Detail, error) { return get(s.Staff, id) }

// ListByFacility は、staff.Repository の ListByFacility を実装する。
func (s Staff) ListByFacility(_ context.Context, facilityID string, _ staff.ListQuery) ([]staff.Summary, error) {
	var out []staff.Summary
	for _, d := range s.Staff {
		if d.FacilityID == facilityID {
			out = append(out, d.Summary)
		}
	}
	return out, nil
}

// FindIDBySub は、sub を結び付けた職員の ID を返す。
func (s Staff) FindIDBySub(_ context.Context, sub string) (string, error) {
	for id, d := range s.Staff {
		if d.Sub != nil && *d.Sub == sub {
			return id, nil
		}
	}
	return "", apperr.ErrNotFound
}

// StartLeave は、職員を休職にした時刻と戻る予定の日を書く。休職の職員では、最初に休職にした時刻を残す。
// 退職した職員なら apperr.ErrConflict を返す。
func (s Staff) StartLeave(_ context.Context, id string, returnDate *civil.Date) error {
	d, ok := s.Staff[id]
	switch {
	case !ok:
		return apperr.ErrNotFound
	case d.RetiredAt != nil:
		return apperr.ErrConflict
	}
	if d.LeaveStartedAt == nil {
		now := time.Now()
		d.LeaveStartedAt = &now
	}
	d.LeaveReturnDate = returnDate
	s.Staff[id] = d
	return nil
}

// EndLeave は、職員の休職を外す。退職した職員なら apperr.ErrConflict を返す。
func (s Staff) EndLeave(_ context.Context, id string) error {
	d, ok := s.Staff[id]
	switch {
	case !ok:
		return apperr.ErrNotFound
	case d.RetiredAt != nil:
		return apperr.ErrConflict
	}
	d.LeaveStartedAt, d.LeaveReturnDate = nil, nil
	s.Staff[id] = d
	return nil
}

// Retire は、職員を退職にし、休職を外してメールと電話番号を消す。退職した職員では、最初に退職にした時刻を残す。
func (s Staff) Retire(_ context.Context, id string) error {
	d, ok := s.Staff[id]
	if !ok {
		return apperr.ErrNotFound
	}
	if d.RetiredAt == nil {
		now := time.Now()
		d.RetiredAt = &now
	}
	d.LeaveStartedAt, d.LeaveReturnDate, d.Email, d.PhoneNumber = nil, nil, "", nil
	s.Staff[id] = d
	return nil
}

// ActiveManagers は、事業所で職員の管理の権限を Policies か Grants に持つ有効な職員の ID を、ID の順に返す。
func (s Staff) ActiveManagers(_ context.Context, facilityID string) ([]string, error) {
	var out []string
	for id, d := range s.Staff {
		if d.FacilityID != facilityID || d.Status() != staff.StatusActive {
			continue
		}
		manages := slices.ContainsFunc(d.Policies, func(g staff.PolicyGrant) bool { return g.PolicyCode == organization.StaffManage }) ||
			slices.ContainsFunc(s.Grants[id], func(g staff.Grant) bool { return s.Policies[g.PolicyID].Code == organization.StaffManage })
		if manages {
			out = append(out, id)
		}
	}
	slices.Sort(out)
	return out, nil
}

// StaffAssignments は、staff.AssignmentReader のメモリ上の実装である。
type StaffAssignments struct{ *Store }

// From は、職員が予定の職員、主訪問者、同行者のどれかの、from 以降のキャンセルしていない予定と、from 以降に終わる
// 繰り返しの予定と、利用中の担当の利用者を、ID の順に返す。
func (s StaffAssignments) From(_ context.Context, facilityID, staffID string, from civil.Date) (staff.Assignments, error) {
	assigned := func(slot schedule.Slot, infoID *string) bool {
		if slot.StaffID == staffID {
			return true
		}
		if infoID == nil {
			return false
		}
		i := s.Infos[*infoID]
		return i.AssignedStaffID == staffID || (i.CompanionID != nil && *i.CompanionID == staffID)
	}
	var out staff.Assignments
	for id, d := range s.Schedules {
		if _, cancelled := s.Cancels[id]; cancelled || d.FacilityID != facilityID || d.Date.Before(from) || !assigned(d.Slot, d.VisitInfoID) {
			continue
		}
		out.Schedules = append(out.Schedules, staff.AssignedSchedule{ID: id, Date: d.Date, StartTime: d.StartTime, EndTime: d.EndTime, EndsNextDay: d.EndsNextDay})
	}
	for id, d := range s.Recurring {
		if d.FacilityID != facilityID || (d.Rule.EndDate != nil && d.Rule.EndDate.Before(from)) || !assigned(d.Slot, d.VisitInfoID) {
			continue
		}
		out.RecurringSchedules = append(out.RecurringSchedules, staff.AssignedRecurring{ID: id, Date: d.Date, EndDate: d.Rule.EndDate, StartTime: d.StartTime, EndTime: d.EndTime, EndsNextDay: d.EndsNextDay})
	}
	for id, p := range s.Patients {
		if p.FacilityID == facilityID && p.AssignedStaffID == staffID && !p.IsEnded() {
			out.Patients = append(out.Patients, staff.AssignedPatient{ID: id, Name: p.Name})
		}
	}
	slices.SortFunc(out.Schedules, func(a, b staff.AssignedSchedule) int { return strings.Compare(a.ID, b.ID) })
	slices.SortFunc(out.RecurringSchedules, func(a, b staff.AssignedRecurring) int { return strings.Compare(a.ID, b.ID) })
	slices.SortFunc(out.Patients, func(a, b staff.AssignedPatient) int { return strings.Compare(a.ID, b.ID) })
	return out, nil
}

// StaffRefs は、kernel.Finder[staff.Ref] と、予定が使う職員の一覧のメモリ上の実装である。
type StaffRefs struct{ *Store }

// Get は、kernel.Finder[staff.Ref] の Get を実装する。
func (s StaffRefs) Get(_ context.Context, id string) (staff.Ref, error) {
	d, err := get(s.Staff, id)
	return ref(d), err
}

func ref(d staff.Detail) staff.Ref {
	return staff.Ref{ID: d.ID, FacilityID: d.FacilityID, TeamID: d.TeamID, Status: d.Status(), NonVisiting: d.NonVisiting}
}

// ListByFacility は、schedule.StaffRefs の ListByFacility を実装する。
func (s StaffRefs) ListByFacility(_ context.Context, facilityID string) ([]staff.Ref, error) {
	var out []staff.Ref
	for _, d := range s.Staff {
		if d.FacilityID == facilityID {
			out = append(out, ref(d))
		}
	}
	return out, nil
}
