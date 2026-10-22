// Package inmem は、全リポジトリと Transactor と IDGenerator の、テストのためのメモリ上の実装を持つ。本番のコードから使わない。
package inmem

import (
	"context"
	"fmt"
	"slices"
	"strings"
	"time"

	"github.com/Fukuemon/buddy/apps/schedule-api/internal/apperr"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/calendar"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/civil"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/organization"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/patient"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/schedule"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/staff"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/visit"
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
	Cancels       map[string]schedule.Cancel
	Calendars     map[string]calendar.ExternalCalendar
	Runs          map[string]calendar.ImportRun
	Links         map[string]calendar.Link
	Exports       map[string]calendar.Export
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
		Cancels:       map[string]schedule.Cancel{},
		Calendars:     map[string]calendar.ExternalCalendar{},
		Runs:          map[string]calendar.ImportRun{},
		Links:         map[string]calendar.Link{},
		Exports:       map[string]calendar.Export{},
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

// Get は、事業所を返す。
func (s Facilities) Get(_ context.Context, id string) (organization.Facility, error) {
	return get(s.Facilities, id)
}

// GetByOrgID は、組織に結び付けた事業所を返す。
func (s Facilities) GetByOrgID(_ context.Context, orgID string) (organization.Facility, error) {
	return get(s.Facilities, s.FacilityByOrg[orgID])
}

// Departments は、organization.DepartmentRepository のメモリ上の実装である。
type Departments struct{ *Store }

// Get は、部署を返す。
func (s Departments) Get(_ context.Context, id string) (organization.Department, error) {
	return get(s.Departments, id)
}

// ListByFacility は、事業所の部署を返す。
func (s Departments) ListByFacility(_ context.Context, facilityID string) ([]organization.Department, error) {
	var out []organization.Department
	for _, d := range s.Departments {
		if d.FacilityID == facilityID {
			out = append(out, d)
		}
	}
	return out, nil
}

// Teams は、organization.TeamRepository のメモリ上の実装である。
type Teams struct{ *Store }

// Get は、チームを返す。
func (s Teams) Get(_ context.Context, id string) (organization.Team, error) { return get(s.Teams, id) }

// ListByFacility は、常に空を返す。
func (s Teams) ListByFacility(context.Context, string) ([]organization.Team, error) {
	return nil, nil
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

// Get は、役職を返す。
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

// Get は、権限を返す。
func (s Policies) Get(_ context.Context, id string) (organization.Policy, error) {
	return get(s.Policies, id)
}

// List は、常に空を返す。
func (s Policies) List(context.Context) ([]organization.Policy, error) { return nil, nil }

// ListByIDs は、ids のうち見つかった権限を返す。
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

// Get は、職員を返す。
func (s Staff) Get(_ context.Context, id string) (staff.Detail, error) { return get(s.Staff, id) }

// ListByFacility は、事業所の職員を返す。
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

// LinkSub は、事業所の同じメールで sub がまだない職員に sub を結び付ける。DB と同じく、メールは完全に一致する値だけを比べる。
func (s Staff) LinkSub(_ context.Context, facilityID, email, sub string) error {
	for id, d := range s.Staff {
		if d.FacilityID == facilityID && d.Email == email && d.Sub == nil {
			d.Sub = &sub
			s.Staff[id] = d
		}
	}
	return nil
}

// StaffRefs は、kernel.Finder[staff.Ref] と、予定が使う職員の一覧のメモリ上の実装である。
type StaffRefs struct{ *Store }

// Get は、職員の事業所とチームを返す。
func (s StaffRefs) Get(_ context.Context, id string) (staff.Ref, error) {
	d, err := get(s.Staff, id)
	return staff.Ref{ID: d.ID, FacilityID: d.FacilityID, TeamID: d.TeamID}, err
}

// ListByFacility は、事業所の職員の事業所とチームを返す。
func (s StaffRefs) ListByFacility(_ context.Context, facilityID string) ([]staff.Ref, error) {
	var out []staff.Ref
	for _, d := range s.Staff {
		if d.FacilityID == facilityID {
			out = append(out, staff.Ref{ID: d.ID, FacilityID: d.FacilityID, TeamID: d.TeamID})
		}
	}
	return out, nil
}

// Patients は、patient.Repository のメモリ上の実装である。
type Patients struct{ *Store }

// Create は、利用者を保存する。
func (s Patients) Create(_ context.Context, p patient.Patient) error {
	s.Patients[p.ID] = patient.Detail{Patient: p}
	return nil
}

// Get は、利用者を返す。
func (s Patients) Get(_ context.Context, id string) (patient.Detail, error) {
	return get(s.Patients, id)
}

// ListByFacility は、事業所の利用者を ID の順に返す。絞り込みと並べ替えは使わない。
func (s Patients) ListByFacility(_ context.Context, facilityID string, _ patient.ListQuery) ([]patient.Detail, error) {
	var out []patient.Detail
	for _, p := range s.Patients {
		if p.FacilityID == facilityID {
			out = append(out, p)
		}
	}
	slices.SortFunc(out, func(a, b patient.Detail) int { return strings.Compare(a.ID, b.ID) })
	return out, nil
}

// VisitInfos は、visit.InfoRepository のメモリ上の実装である。
type VisitInfos struct{ *Store }

// Create は、訪問の情報を保存する。
func (s VisitInfos) Create(_ context.Context, i visit.Info) error {
	s.Infos[i.ID] = i
	return nil
}

// DeleteIfUnused は、どの予定と繰り返しの予定も指していない訪問の情報を消す。
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

// GetServiceCode は、サービスコードを返す。
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

// ListCategoriesByIDs は、ids のうち見つかった訪問の区分を返す。
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

// Get は、予定の種類を返す。
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

// Create は、単発の予定を保存する。
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

// Get は、単発の予定と、あればキャンセルを返す。
func (s Schedules) Get(_ context.Context, id string) (schedule.Detail, error) {
	d, err := get(s.Schedules, id)
	if c, ok := s.Cancels[id]; ok {
		d.Cancel = &c
	}
	return d, err
}

// ListByFacility は、事業所の単発の予定を返す。
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
func (s Schedules) CreateCancel(_ context.Context, c schedule.Cancel) error {
	if _, ok := s.Cancels[c.ScheduleID]; ok {
		return apperr.ErrConflict
	}
	s.Cancels[c.ScheduleID] = c
	d := s.Schedules[c.ScheduleID]
	d.Version++
	s.Schedules[c.ScheduleID] = d
	return nil
}

// RecurringSchedules は、schedule.RecurringRepository のメモリ上の実装である。
type RecurringSchedules struct{ *Store }

// Create は、繰り返しの予定を保存する。
func (s RecurringSchedules) Create(_ context.Context, rs schedule.RecurringSchedule) error {
	s.Recurring[rs.ID] = schedule.RecurringDetail{RecurringSchedule: rs, TypeName: s.Types[rs.TypeID].Name, Version: 1}
	return nil
}

// Get は、繰り返しの予定を返す。
func (s RecurringSchedules) Get(_ context.Context, id string) (schedule.RecurringDetail, error) {
	return get(s.Recurring, id)
}

// ListByFacility は、事業所の繰り返しの予定を返す。
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

// FindByCalendarID は、provider と calendarID のカレンダーを返す。
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

// activeOf は、職員に外していないカレンダーがあるかを返す。
func (s Calendars) activeOf(staffID, exceptID string) bool {
	for _, c := range s.Calendars {
		if c.StaffID == staffID && c.DisabledAt == nil && c.ID != exceptID {
			return true
		}
	}
	return false
}

// Create は、カレンダーを保存する。職員に外していないカレンダーがあるか、同じカレンダーがあるときは apperr.ErrConflict を返す。
func (s Calendars) Create(ctx context.Context, c calendar.ExternalCalendar) error {
	if _, err := s.FindByCalendarID(ctx, c.Provider, c.CalendarID); err == nil || s.activeOf(c.StaffID, "") {
		return apperr.ErrConflict
	}
	s.Calendars[c.ID] = c
	return nil
}

// Enable は、外したカレンダーを結び付け直す。職員に外していないカレンダーがあるときは apperr.ErrConflict を返す。
func (s Calendars) Enable(_ context.Context, id string) error {
	c := s.Calendars[id]
	if s.activeOf(c.StaffID, id) {
		return apperr.ErrConflict
	}
	c.DisabledAt = nil
	s.Calendars[id] = c
	return nil
}

// Disable は、カレンダーを外す。
func (s Calendars) Disable(_ context.Context, id string) error {
	c := s.Calendars[id]
	if c.DisabledAt == nil {
		now := time.Now()
		c.DisabledAt = &now
		s.Calendars[id] = c
	}
	return nil
}

// RunningSince は、since より後に始めた running の取り込みがあるかを返す。
func (s Calendars) RunningSince(_ context.Context, externalCalendarID string, since time.Time) (bool, error) {
	for _, r := range s.Runs {
		if r.ExternalCalendarID == externalCalendarID && r.Status == calendar.RunRunning && r.StartedAt.After(since) {
			return true, nil
		}
	}
	return false, nil
}

// CreateRun は、始めた時刻を今にして取り込みの記録を保存する。
func (s Calendars) CreateRun(_ context.Context, r calendar.ImportRun) error {
	r.StartedAt = time.Now()
	s.Runs[r.ID] = r
	return nil
}

// FinishRun は、取り込みの記録の状態と件数を書き、終わった時刻を今にする。
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

// ListLinks は、カレンダーの予定の対応を返す。
func (s Calendars) ListLinks(_ context.Context, externalCalendarID string) ([]calendar.Link, error) {
	var out []calendar.Link
	for _, l := range s.Links {
		if l.ExternalCalendarID == externalCalendarID {
			out = append(out, l)
		}
	}
	return out, nil
}

// CreateLink は、予定の対応を保存する。同じ外部の予定の対応があるときは apperr.ErrConflict を返す。
func (s Calendars) CreateLink(_ context.Context, l calendar.Link) error {
	for _, cur := range s.Links {
		if cur.ExternalCalendarID == l.ExternalCalendarID && cur.ExternalEventID == l.ExternalEventID {
			return apperr.ErrConflict
		}
	}
	s.Links[l.ID] = l
	return nil
}

// ActiveByStaff は、職員に結び付けた外していないカレンダーを返す。
func (s Calendars) ActiveByStaff(_ context.Context, staffID string) (calendar.ExternalCalendar, error) {
	for _, c := range s.Calendars {
		if c.StaffID == staffID && c.DisabledAt == nil {
			return c, nil
		}
	}
	return calendar.ExternalCalendar{}, apperr.ErrNotFound
}

// LinkBySchedule は、単発の予定の対応を返す。
func (s Calendars) LinkBySchedule(_ context.Context, scheduleID string) (calendar.Link, error) {
	return s.linkBy(func(l calendar.Link) *string { return l.ScheduleID }, scheduleID)
}

// LinkByRecurringSchedule は、繰り返しの予定の対応を返す。
func (s Calendars) LinkByRecurringSchedule(_ context.Context, recurringScheduleID string) (calendar.Link, error) {
	return s.linkBy(func(l calendar.Link) *string { return l.RecurringScheduleID }, recurringScheduleID)
}

func (s Calendars) linkBy(target func(calendar.Link) *string, id string) (calendar.Link, error) {
	for _, l := range s.Links {
		if t := target(l); t != nil && *t == id {
			return l, nil
		}
	}
	return calendar.Link{}, apperr.ErrNotFound
}

// UpdateLink は、予定の対応の etag と更新の番号を書く。
func (s Calendars) UpdateLink(_ context.Context, id, etag string, version int) error {
	l, err := get(s.Links, id)
	if err != nil {
		return err
	}
	l.ETag, l.SyncedVersion = etag, &version
	s.Links[id] = l
	return nil
}

// DeleteLink は、予定の対応を消す。
func (s Calendars) DeleteLink(_ context.Context, id string) error {
	delete(s.Links, id)
	return nil
}

// Exports は、calendar.ExportRepository のメモリ上の実装である。時刻は time.Now で比べる。
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

// Enqueue は、t の終わっていない待ちを積み直すか、待ちを足す。
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

// Get は、待ちを返す。
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
		out = append(out, calendar.ExportIssue{
			Export: e, StaffID: slot.StaffID, StaffName: s.Staff[slot.StaffID].Username,
			Date: slot.Date, StartTime: slot.StartTime, EndTime: slot.EndTime,
		})
	}
	slices.SortFunc(out, func(a, b calendar.ExportIssue) int { return strings.Compare(a.ID, b.ID) })
	return out, nil
}

// Retry は、確かめが要る待ちを、buddy の内容で書き直す pending の待ちにする。
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
