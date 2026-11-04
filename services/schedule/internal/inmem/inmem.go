// Package inmem は、全リポジトリと Transactor と IDGenerator の、テストのためのメモリ上の実装を持つ。本番のコードから使わない。
package inmem

import (
	"cmp"
	"context"
	"fmt"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendar"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendarsync"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/patient"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/schedule"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/staff"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/visit"
)

// Tx は、fn をそのまま呼ぶ tx.Transactor である。Calls は WithinTx を呼んだ回数である。
type Tx struct{ Calls int }

// WithinTx は、呼んだ回数を数えて fn を呼ぶ。
func (t *Tx) WithinTx(ctx context.Context, fn func(ctx context.Context) error) error {
	t.Calls++
	return fn(ctx)
}

// SeqIDs は、連番の ID を発行する kernel.IDGenerator である。
type SeqIDs struct{ n int }

// NewID は、次の連番の ID を返す。
func (s *SeqIDs) NewID() string {
	s.n++
	return fmt.Sprintf("NEW%023d", s.n)
}

// Store は、全リポジトリのメモリ上の実装が共有する値である。
type Store struct {
	Facilities    map[string]organization.Facility
	FacilityByOrg map[string]string
	Departments   map[string]organization.Department
	Teams         map[string]organization.Team
	Positions     map[string]organization.Position
	Policies      map[string]organization.Policy
	Staff         map[string]staff.Detail
	Grants        map[string][]staff.Grant
	Patients      map[string]patient.Detail
	Codes         map[string]visit.ServiceCode
	Categories    map[string]visit.Category
	Infos         map[string]visit.Info
	Types         map[string]schedule.Type
	Schedules     map[string]schedule.Detail
	Recurring     map[string]schedule.RecurringDetail
	Cancels       map[string]schedule.Cancellation
	Calendars     map[string]calendar.ExternalCalendar
	Runs          map[string]calendar.ImportRun
	Links         map[string]calendar.EventLink
	Exports       map[string]calendar.Export
	// SyncResults は、カレンダーの ID ごとの、最後に同期した結果である。
	SyncResults map[string]calendarsync.SyncResult
}

// NewStore は、空の Store を作る。
func NewStore() *Store {
	return &Store{
		Facilities:    map[string]organization.Facility{},
		FacilityByOrg: map[string]string{},
		Departments:   map[string]organization.Department{},
		Teams:         map[string]organization.Team{},
		Positions:     map[string]organization.Position{},
		Policies:      map[string]organization.Policy{},
		Staff:         map[string]staff.Detail{},
		Grants:        map[string][]staff.Grant{},
		Patients:      map[string]patient.Detail{},
		Codes:         map[string]visit.ServiceCode{},
		Categories:    map[string]visit.Category{},
		Infos:         map[string]visit.Info{},
		Types:         map[string]schedule.Type{},
		Schedules:     map[string]schedule.Detail{},
		Recurring:     map[string]schedule.RecurringDetail{},
		Cancels:       map[string]schedule.Cancellation{},
		Calendars:     map[string]calendar.ExternalCalendar{},
		Runs:          map[string]calendar.ImportRun{},
		Links:         map[string]calendar.EventLink{},
		Exports:       map[string]calendar.Export{},
		SyncResults:   map[string]calendarsync.SyncResult{},
	}
}

func get[T any](m map[string]T, id string) (T, error) {
	v, ok := m[id]
	if !ok {
		var zero T
		return zero, apperr.ErrNotFound
	}
	return v, nil
}

// Facilities は、organization.FacilityRepository のメモリ上の実装である。
type Facilities struct{ *Store }

// Get は、organization.FacilityRepository の Get を実装する。
func (s Facilities) Get(_ context.Context, id string) (organization.Facility, error) {
	return get(s.Facilities, id)
}

// GetByOrgID は、organization.FacilityRepository の GetByOrgID を実装する。
func (s Facilities) GetByOrgID(_ context.Context, orgID string) (organization.Facility, error) {
	return get(s.Facilities, s.FacilityByOrg[orgID])
}

// Departments は、organization.DepartmentRepository のメモリ上の実装である。
type Departments struct{ *Store }

// Get は、organization.DepartmentRepository の Get を実装する。
func (s Departments) Get(_ context.Context, id string) (organization.Department, error) {
	return get(s.Departments, id)
}

// ListByFacility は、organization.DepartmentRepository の ListByFacility を実装する。
func (s Departments) ListByFacility(_ context.Context, facilityID string) ([]organization.Department, error) {
	var out []organization.Department
	for _, d := range s.Departments {
		if d.FacilityID == facilityID {
			out = append(out, d)
		}
	}
	return out, nil
}

// Create は、部署を保存する。同じ事業所に名前が完全に一致する部署があれば apperr.ErrConflict を返す。
// DB の一意の制約と同じく、完全に一致する名前だけを重なりとみなす。
func (s Departments) Create(_ context.Context, d organization.Department) error {
	for _, cur := range s.Departments {
		if cur.FacilityID == d.FacilityID && cur.Name == d.Name {
			return apperr.ErrConflict
		}
	}
	s.Departments[d.ID] = d
	return nil
}

// Update は、部署 d.ID の名前を d の値にする。部署が無ければ apperr.ErrNotFound を、
// 同じ事業所にほかの名前が完全に一致する部署があれば apperr.ErrConflict を返す。
func (s Departments) Update(_ context.Context, d organization.Department) error {
	cur, ok := s.Departments[d.ID]
	if !ok {
		return apperr.ErrNotFound
	}
	for _, other := range s.Departments {
		if other.ID != d.ID && other.FacilityID == cur.FacilityID && other.Name == d.Name {
			return apperr.ErrConflict
		}
	}
	cur.Name = d.Name
	s.Departments[d.ID] = cur
	return nil
}

// Teams は、organization.TeamRepository のメモリ上の実装である。
type Teams struct{ *Store }

// Get は、organization.TeamRepository の Get を実装する。
func (s Teams) Get(_ context.Context, id string) (organization.Team, error) { return get(s.Teams, id) }

// ListByFacility は、事業所 facilityID のチームを名前、ID の順に返す。
func (s Teams) ListByFacility(_ context.Context, facilityID string) ([]organization.Team, error) {
	var out []organization.Team
	for _, t := range s.Teams {
		if t.FacilityID == facilityID {
			out = append(out, t)
		}
	}
	slices.SortFunc(out, func(a, b organization.Team) int {
		return cmp.Or(cmp.Compare(a.Name, b.Name), cmp.Compare(a.ID, b.ID))
	})
	return out, nil
}

// Update は、チーム t.ID の名前と色を t の値にする。チームが無ければ apperr.ErrNotFound を、
// 同じ事業所にほかの名前が完全に一致するチームがあれば apperr.ErrConflict を返す。
func (s Teams) Update(_ context.Context, t organization.Team) error {
	cur, ok := s.Teams[t.ID]
	if !ok {
		return apperr.ErrNotFound
	}
	for _, other := range s.Teams {
		if other.ID != t.ID && other.FacilityID == cur.FacilityID && other.Name == t.Name {
			return apperr.ErrConflict
		}
	}
	cur.Name, cur.Color = t.Name, t.Color
	s.Teams[t.ID] = cur
	return nil
}

// Create は、チームを保存する。同じ事業所に名前が完全に一致するチームがあれば apperr.ErrConflict を返す。
// DB の一意の制約と同じく、完全に一致する名前だけを重なりとみなす。
func (s Teams) Create(_ context.Context, t organization.Team) error {
	for _, cur := range s.Teams {
		if cur.FacilityID == t.FacilityID && cur.Name == t.Name {
			return apperr.ErrConflict
		}
	}
	s.Teams[t.ID] = t
	return nil
}

// Positions は、organization.PositionRepository のメモリ上の実装である。
type Positions struct{ *Store }

// Get は、organization.PositionRepository の Get を実装する。
func (s Positions) Get(_ context.Context, id string) (organization.Position, error) {
	return get(s.Positions, id)
}

// ListByFacility は、常に空を返す。
func (s Positions) ListByFacility(context.Context, string) ([]organization.Position, error) {
	return nil, nil
}

// Create は、役職を保存する。同じ事業所に名前が完全に一致する役職があれば apperr.ErrConflict を返す。
// DB の一意の制約と同じく、完全に一致する名前だけを重なりとみなす。
func (s Positions) Create(_ context.Context, p organization.Position) error {
	for _, cur := range s.Positions {
		if cur.FacilityID == p.FacilityID && cur.Name == p.Name {
			return apperr.ErrConflict
		}
	}
	s.Positions[p.ID] = p
	return nil
}

// Policies は、organization.PolicyRepository のメモリ上の実装である。
type Policies struct{ *Store }

// Get は、organization.PolicyRepository の Get を実装する。
func (s Policies) Get(_ context.Context, id string) (organization.Policy, error) {
	return get(s.Policies, id)
}

// List は、常に空を返す。
func (s Policies) List(context.Context) ([]organization.Policy, error) { return nil, nil }

// ListByIDs は、organization.PolicyRepository の ListByIDs を実装する。
func (s Policies) ListByIDs(_ context.Context, ids []string) ([]organization.Policy, error) {
	var out []organization.Policy
	for _, id := range ids {
		if p, ok := s.Policies[id]; ok {
			out = append(out, p)
		}
	}
	return out, nil
}

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

// LockFacility は、事業所があるかだけを確認する。メモリ上の実装はロックを取らない。
func (s Staff) LockFacility(_ context.Context, facilityID string) error {
	_, err := get(s.Facilities, facilityID)
	return err
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
		out.Schedules = append(out.Schedules, staff.AssignedSchedule{ID: id, Date: d.Date, StartTime: d.StartTime, EndTime: d.EndTime})
	}
	for id, d := range s.Recurring {
		if d.FacilityID != facilityID || (d.Rule.EndDate != nil && d.Rule.EndDate.Before(from)) || !assigned(d.Slot, d.VisitInfoID) {
			continue
		}
		out.RecurringSchedules = append(out.RecurringSchedules, staff.AssignedRecurring{ID: id, Date: d.Date, EndDate: d.Rule.EndDate, StartTime: d.StartTime, EndTime: d.EndTime})
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

// LockStatuses は、事業所があるかだけを確認する。メモリ上の実装はロックを取らない。
func (s StaffRefs) LockStatuses(_ context.Context, facilityID string) error {
	_, err := get(s.Facilities, facilityID)
	return err
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

// VisitInfos は、visit.InfoRepository のメモリ上の実装である。
type VisitInfos struct{ *Store }

// Create は、visit.InfoRepository の Create を実装する。
func (s VisitInfos) Create(_ context.Context, i visit.Info) error {
	s.Infos[i.ID] = i
	return nil
}

// DeleteIfUnused は、visit.InfoRepository の DeleteIfUnused を実装する。
func (s VisitInfos) DeleteIfUnused(_ context.Context, id string) error {
	for _, d := range s.Schedules {
		if d.VisitInfoID != nil && *d.VisitInfoID == id {
			return nil
		}
	}
	for _, d := range s.Recurring {
		if d.VisitInfoID != nil && *d.VisitInfoID == id {
			return nil
		}
	}
	delete(s.Infos, id)
	return nil
}

// VisitMasters は、visit.MasterRepository のメモリ上の実装である。
type VisitMasters struct{ *Store }

// GetServiceCode は、visit.MasterRepository の GetServiceCode を実装する。
func (s VisitMasters) GetServiceCode(_ context.Context, id string) (visit.ServiceCode, error) {
	return get(s.Codes, id)
}

// ListServiceCodes は、サービスコードを ID の順に返す。
func (s VisitMasters) ListServiceCodes(context.Context) ([]visit.ServiceCode, error) {
	out := make([]visit.ServiceCode, 0, len(s.Codes))
	for _, c := range s.Codes {
		out = append(out, c)
	}
	slices.SortFunc(out, func(a, b visit.ServiceCode) int { return strings.Compare(a.ID, b.ID) })
	return out, nil
}

// ListCategories は、常に空を返す。
func (s VisitMasters) ListCategories(context.Context) ([]visit.Category, error) { return nil, nil }

// ListCategoriesByIDs は、visit.MasterRepository の ListCategoriesByIDs を実装する。
func (s VisitMasters) ListCategoriesByIDs(_ context.Context, ids []string) ([]visit.Category, error) {
	var out []visit.Category
	for _, id := range ids {
		if c, ok := s.Categories[id]; ok {
			out = append(out, c)
		}
	}
	return out, nil
}

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

// Schedules は、schedule.Repository のメモリ上の実装である。
type Schedules struct{ *Store }

// Create は、schedule.Repository の Create を実装する。
func (s Schedules) Create(_ context.Context, sc schedule.Schedule) error {
	s.Schedules[sc.ID] = schedule.Detail{Schedule: sc, TypeName: s.Types[sc.TypeID].Name, Version: 1}
	return nil
}

// GetForUpdate は、Get と同じ値を返す。メモリ上の実装はロックを取らない。
func (s Schedules) GetForUpdate(ctx context.Context, id string) (schedule.Detail, error) {
	return s.Get(ctx, id)
}

// Update は、単発の予定を置き換える。繰り返しの予定と元の回の日付は前のままにする。
func (s Schedules) Update(_ context.Context, sc schedule.Schedule) error {
	cur, ok := s.Schedules[sc.ID]
	if !ok {
		return apperr.ErrNotFound
	}
	sc.RecurringScheduleID = cur.RecurringScheduleID
	sc.OriginalDate = cur.OriginalDate
	s.Schedules[sc.ID] = schedule.Detail{Schedule: sc, TypeName: s.Types[sc.TypeID].Name, Version: cur.Version + 1}
	return nil
}

// Get は、単発の予定と、あれば訪問の情報とキャンセルを返す。訪問の情報は、ID と職員と利用者とサービスコードだけを持つ。
func (s Schedules) Get(_ context.Context, id string) (schedule.Detail, error) {
	d, err := get(s.Schedules, id)
	d.Visit = s.visit(d.VisitInfoID)
	if c, ok := s.Cancels[id]; ok {
		d.Cancel = &c
	}
	return d, err
}

// ListByFacility は、schedule.Repository の ListByFacility を実装する。
func (s Schedules) ListByFacility(_ context.Context, facilityID string, _ schedule.ListQuery) ([]schedule.Detail, error) {
	var out []schedule.Detail
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

// ReplacementOf は、繰り返しの予定の d の回を置き換えた単発の予定を返す。
func (s Schedules) ReplacementOf(ctx context.Context, recurringScheduleID string, d civil.Date) (schedule.Detail, error) {
	for id, sc := range s.Schedules {
		if sc.RecurringScheduleID != nil && *sc.RecurringScheduleID == recurringScheduleID && sc.OriginalDate != nil && *sc.OriginalDate == d {
			return s.Get(ctx, id)
		}
	}
	return schedule.Detail{}, apperr.ErrNotFound
}

// RecurringSchedules は、schedule.RecurringRepository のメモリ上の実装である。
type RecurringSchedules struct{ *Store }

// Create は、schedule.RecurringRepository の Create を実装する。
func (s RecurringSchedules) Create(_ context.Context, rs schedule.RecurringSchedule) error {
	s.Recurring[rs.ID] = schedule.RecurringDetail{RecurringSchedule: rs, TypeName: s.Types[rs.TypeID].Name, Version: 1}
	return nil
}

// GetForUpdate は、Get と同じ値を返す。メモリ上の実装はロックを取らない。
func (s RecurringSchedules) GetForUpdate(ctx context.Context, id string) (schedule.RecurringDetail, error) {
	return s.Get(ctx, id)
}

// Get は、繰り返しの予定と、あれば訪問の情報を返す。訪問の情報は、Schedules.Get と同じ項目だけを持つ。
func (s RecurringSchedules) Get(_ context.Context, id string) (schedule.RecurringDetail, error) {
	d, err := get(s.Recurring, id)
	d.Visit = s.visit(d.VisitInfoID)
	return d, err
}

// visit は、ID が id の訪問の情報を返す。id が nil か、訪問の情報が無ければ nil を返す。
func (s *Store) visit(id *string) *visit.Detail {
	if id == nil {
		return nil
	}
	i, ok := s.Infos[*id]
	if !ok {
		return nil
	}
	return &visit.Detail{
		ID: i.ID, PatientID: i.PatientID, AssignedStaffID: i.AssignedStaffID, CompanionID: i.CompanionID, ServiceCodeID: i.ServiceCodeID,
	}
}

// ListByFacility は、schedule.RecurringRepository の ListByFacility を実装する。
func (s RecurringSchedules) ListByFacility(_ context.Context, facilityID string, _ schedule.ListQuery) ([]schedule.RecurringDetail, error) {
	var out []schedule.RecurringDetail
	for _, d := range s.Recurring {
		if d.FacilityID == facilityID {
			out = append(out, d)
		}
	}
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

// Calendars は、calendar.Repository のメモリ上の実装である。ロックは取らない。
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

// RunningSince は、calendar.Repository の RunningSince を実装する。
func (s Calendars) RunningSince(_ context.Context, externalCalendarID string, since time.Time) (bool, error) {
	for _, r := range s.Runs {
		if r.ExternalCalendarID == externalCalendarID && r.Status == calendar.RunRunning && r.StartedAt.After(since) {
			return true, nil
		}
	}
	return false, nil
}

// CreateRun は、calendar.Repository の CreateRun を実装する。
func (s Calendars) CreateRun(_ context.Context, r calendar.ImportRun) error {
	r.StartedAt = time.Now()
	s.Runs[r.ID] = r
	return nil
}

// FinishRun は、calendar.Repository の FinishRun を実装する。
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

// ListLinks は、calendar.Repository の ListLinks を実装する。
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

// ActiveByStaff は、calendar.Repository の ActiveByStaff を実装する。
func (s Calendars) ActiveByStaff(_ context.Context, staffID string) (calendar.ExternalCalendar, error) {
	for _, c := range s.Calendars {
		if c.StaffID == staffID && c.DisabledAt == nil {
			return c, nil
		}
	}
	return calendar.ExternalCalendar{}, apperr.ErrNotFound
}

// LinkBySchedule は、calendar.Repository の LinkBySchedule を実装する。
func (s Calendars) LinkBySchedule(_ context.Context, scheduleID string) (calendar.EventLink, error) {
	return s.linkBy(func(l calendar.EventLink) *string { return l.ScheduleID }, scheduleID)
}

// LinkByRecurringSchedule は、calendar.Repository の LinkByRecurringSchedule を実装する。
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

// UpdateLink は、calendar.Repository の UpdateLink を実装する。
func (s Calendars) UpdateLink(_ context.Context, id, etag string, version int) error {
	l, err := get(s.Links, id)
	if err != nil {
		return err
	}
	l.ETag, l.SyncedVersion = etag, &version
	s.Links[id] = l
	return nil
}

// DeleteLink は、calendar.Repository の DeleteLink を実装する。
func (s Calendars) DeleteLink(_ context.Context, id string) error {
	delete(s.Links, id)
	return nil
}

// Exports は、calendarsync.ExportRepository と calendarexport.ExportRepository のメモリ上の実装である。時刻は time.Now で比べる。
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

// Enqueue は、calendarsync.ExportRepository と calendarexport.ExportRepository の Enqueue を実装する。
func (s Exports) Enqueue(_ context.Context, id string, t calendar.Target) error {
	e, ok := s.open(t)
	if !ok {
		s.Exports[id] = calendar.Export{ID: id, Target: t, Status: calendar.ExportPending, Revision: 1, NextAttemptAt: time.Now()}
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

// Get は、calendarsync.ExportRepository と calendarexport.ExportRepository の Get を実装する。
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

// Retry は、calendarsync.ExportRepository と calendarexport.ExportRepository の Retry を実装する。
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

// Open は、calendarsync.ExportRepository の Open を実装する。
func (s Exports) Open(_ context.Context, t calendar.Target) (calendar.Export, error) {
	if e, ok := s.open(t); ok {
		return e, nil
	}
	return calendar.Export{}, apperr.ErrNotFound
}

// Hold は、calendarsync.ExportRepository の Hold を実装する。
func (s Exports) Hold(_ context.Context, id string, t calendar.Target, code calendar.ExportErrorCode) error {
	e, ok := s.open(t)
	if !ok {
		e = calendar.Export{ID: id, Target: t, NextAttemptAt: time.Now()}
	}
	e.Revision++
	e.Status, e.ErrorCode, e.Overwrite, e.LockedUntil = calendar.ExportConflict, &code, false, nil
	s.Exports[e.ID] = e
	return nil
}

// Resolve は、calendarsync.ExportRepository の Resolve を実装する。
func (s Exports) Resolve(_ context.Context, id string, revision int) error {
	e, err := get(s.Exports, id)
	if err != nil {
		return err
	}
	if !e.IsInReview() || e.Revision != revision {
		return apperr.ErrConflict
	}
	e.Status, e.ErrorCode, e.Overwrite = calendar.ExportSucceeded, nil, false
	s.Exports[id] = e
	return nil
}

// Syncs は、calendarsync.SyncRepository のメモリ上の実装である。読む時刻と lease を持たず、取るたびに外していない全てのカレンダーを返す。
type Syncs struct{ *Store }

// Claim は、外していないカレンダーを ID の順に max 件まで、最後に同期した結果のトークンを付けて返す。
func (s Syncs) Claim(_ context.Context, max int, _ time.Duration) ([]calendarsync.SyncState, error) {
	var out []calendarsync.SyncState
	for _, c := range s.Calendars {
		if c.DisabledAt != nil {
			continue
		}
		st := calendarsync.SyncState{Calendar: c, LastStatus: calendarsync.SyncNever}
		if r, ok := s.SyncResults[c.ID]; ok {
			st.SyncToken, st.LastStatus, st.LastError = r.SyncToken, r.Status, r.ErrorCode
		}
		out = append(out, st)
	}
	slices.SortFunc(out, func(a, b calendarsync.SyncState) int { return strings.Compare(a.Calendar.ID, b.Calendar.ID) })
	return out[:min(max, len(out))], nil
}

// Finish は、calendarsync.SyncRepository の Finish を実装する。
func (s Syncs) Finish(_ context.Context, st calendarsync.SyncState, r calendarsync.SyncResult) error {
	s.SyncResults[st.Calendar.ID] = r
	return nil
}

// Identity は、Identities が持つブローカーの職員である。Pending は登録の途中で、Activate で外れる。
// Suspended は休職で、Resume で外れる。Retired は退職で、メールを消す。
type Identity struct {
	OrgID     string
	Email     string
	Pending   bool
	Suspended bool
	Retired   bool
}

// Identities は、staff.Identities のメモリ上の実装で、ブローカーの職員を ID ごとに持つ。ID は "broker-1" から順に振る。
type Identities struct {
	Members map[string]Identity
	// Err は、Register、Suspend、Retire が返すエラーである。nil なら成功する。
	Err error
	// ActivateErr は、Activate が返すエラーである。nil なら成功する。
	ActivateErr error
	// ResumeErr は、Resume が返すエラーである。nil なら成功する。
	ResumeErr error
	// RevokeErr は、Suspend と Retire が職員を書いた後に返すエラーで、Hydra の取り消しの失敗を表す。nil なら成功する。
	RevokeErr error
	seq       int
}

// NewIdentities は、ブローカーの職員がいない Identities を作る。
func NewIdentities() *Identities { return &Identities{Members: map[string]Identity{}} }

// Register は、同じメールの職員がいなければ、新しい ID の登録の途中の職員を作る。同じ組織にいればその職員を返す。
// 止めた職員なら staff.ErrIdentitySuspended を、ほかの組織にいれば staff.ErrEmailTaken を返す。
func (s *Identities) Register(_ context.Context, orgID, email string) (staff.Registration, error) {
	if s.Err != nil {
		return staff.Registration{}, s.Err
	}
	for id, m := range s.Members {
		switch {
		case m.Email != email:
			continue
		case m.OrgID != orgID:
			return staff.Registration{}, staff.ErrEmailTaken
		case m.Suspended:
			return staff.Registration{}, staff.ErrIdentitySuspended
		}
		return staff.Registration{ID: id, Pending: m.Pending}, nil
	}
	s.seq++
	id := "broker-" + strconv.Itoa(s.seq)
	s.Members[id] = Identity{OrgID: orgID, Email: email, Pending: true}
	return staff.Registration{ID: id, Created: true, Pending: true}, nil
}

// Activate は、職員の登録の途中を外す。いなければ apperr.ErrNotFound を、止めた職員なら staff.ErrIdentitySuspended を返す。
func (s *Identities) Activate(_ context.Context, id string) error {
	if s.ActivateErr != nil {
		return s.ActivateErr
	}
	m, ok := s.Members[id]
	switch {
	case !ok:
		return apperr.ErrNotFound
	case m.Suspended:
		return staff.ErrIdentitySuspended
	}
	m.Pending = false
	s.Members[id] = m
	return nil
}

// Unregister は、登録の途中の職員を消す。いないか、登録の途中でなければ何もしない。
func (s *Identities) Unregister(_ context.Context, id string) error {
	if m, ok := s.Members[id]; ok && m.Pending {
		delete(s.Members, id)
	}
	return nil
}

// Suspend は、職員を止める。RevokeErr があれば、止めてから RevokeErr を staff.ErrRevokeFailed で包んで返す。
// いなければ apperr.ErrNotFound を返す。
func (s *Identities) Suspend(_ context.Context, id string) error {
	if s.Err != nil {
		return s.Err
	}
	m, ok := s.Members[id]
	switch {
	case !ok:
		return apperr.ErrNotFound
	case m.Retired:
		return staff.ErrIdentityRetired
	}
	m.Suspended = true
	s.Members[id] = m
	return s.revoked()
}

// Resume は、職員の休職を外す。ResumeErr があれば、何もせずに返す。いなければ apperr.ErrNotFound を、
// 退職した職員なら staff.ErrIdentityRetired を、登録の途中の職員なら apperr.ErrConflict を返す。
func (s *Identities) Resume(_ context.Context, id string) error {
	if s.ResumeErr != nil {
		return s.ResumeErr
	}
	m, ok := s.Members[id]
	switch {
	case !ok:
		return apperr.ErrNotFound
	case m.Retired:
		return staff.ErrIdentityRetired
	case m.Pending:
		return apperr.ErrConflict
	}
	m.Suspended = false
	s.Members[id] = m
	return nil
}

// Retire は、職員を退職にし、メールを消す。RevokeErr があれば、退職にしてから RevokeErr を staff.ErrRevokeFailed で包んで返す。
// いなければ apperr.ErrNotFound を返す。
func (s *Identities) Retire(_ context.Context, id string) error {
	if s.Err != nil {
		return s.Err
	}
	m, ok := s.Members[id]
	if !ok {
		return apperr.ErrNotFound
	}
	m.Retired, m.Suspended, m.Email = true, false, ""
	s.Members[id] = m
	return s.revoked()
}

func (s *Identities) revoked() error {
	if s.RevokeErr != nil {
		return fmt.Errorf("%w: %w", staff.ErrRevokeFailed, s.RevokeErr)
	}
	return nil
}
