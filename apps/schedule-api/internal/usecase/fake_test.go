package usecase_test

import (
	"context"
	"fmt"

	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain/civil"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain/organization"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain/patient"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain/schedule"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain/staff"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain/visit"
)

type fakeTx struct{ calls int }

func (t *fakeTx) WithinTx(ctx context.Context, fn func(ctx context.Context) error) error {
	t.calls++
	return fn(ctx)
}

type seqIDs struct{ n int }

func (s *seqIDs) NewID() string {
	s.n++
	return fmt.Sprintf("NEW%023d", s.n)
}

// store は、usecase のテストに使う全リポジトリのメモリ上の実装である。
type store struct {
	facilities    map[string]organization.Facility
	facilityByOrg map[string]string
	departments   map[string]organization.Department
	teams         map[string]organization.Team
	positions     map[string]organization.Position
	policies      map[string]organization.Policy
	staff         map[string]staff.Detail
	grants        map[string][]staff.Grant
	patients      map[string]patient.Detail
	codes         map[string]visit.ServiceCode
	categories    map[string]visit.Category
	infos         map[string]visit.Info
	types         map[string]schedule.Type
	schedules     map[string]schedule.Detail
	recurring     map[string]schedule.RecurringDetail
	cancels       map[string]schedule.Cancel
}

func newStore() *store {
	return &store{
		facilities:    map[string]organization.Facility{},
		facilityByOrg: map[string]string{},
		departments:   map[string]organization.Department{},
		teams:         map[string]organization.Team{},
		positions:     map[string]organization.Position{},
		policies:      map[string]organization.Policy{},
		staff:         map[string]staff.Detail{},
		grants:        map[string][]staff.Grant{},
		patients:      map[string]patient.Detail{},
		codes:         map[string]visit.ServiceCode{},
		categories:    map[string]visit.Category{},
		infos:         map[string]visit.Info{},
		types:         map[string]schedule.Type{},
		schedules:     map[string]schedule.Detail{},
		recurring:     map[string]schedule.RecurringDetail{},
		cancels:       map[string]schedule.Cancel{},
	}
}

func get[T any](m map[string]T, id string) (T, error) {
	v, ok := m[id]
	if !ok {
		var zero T
		return zero, domain.ErrNotFound
	}
	return v, nil
}

type facilities struct{ *store }

func (s facilities) Get(_ context.Context, id string) (organization.Facility, error) {
	return get(s.facilities, id)
}

func (s facilities) GetByOrgID(_ context.Context, orgID string) (organization.Facility, error) {
	return get(s.facilities, s.facilityByOrg[orgID])
}

type departments struct{ *store }

func (s departments) Get(_ context.Context, id string) (organization.Department, error) {
	return get(s.departments, id)
}

func (s departments) ListByFacility(_ context.Context, facilityID string) ([]organization.Department, error) {
	var out []organization.Department
	for _, d := range s.departments {
		if d.FacilityID == facilityID {
			out = append(out, d)
		}
	}
	return out, nil
}

type teams struct{ *store }

func (s teams) Get(_ context.Context, id string) (organization.Team, error) { return get(s.teams, id) }

func (s teams) ListByFacility(context.Context, string) ([]organization.Team, error) {
	return nil, nil
}

func (s teams) Create(_ context.Context, t organization.Team) error {
	s.teams[t.ID] = t
	return nil
}

type positions struct{ *store }

func (s positions) Get(_ context.Context, id string) (organization.Position, error) {
	return get(s.positions, id)
}

func (s positions) ListByFacility(context.Context, string) ([]organization.Position, error) {
	return nil, nil
}

func (s positions) Create(_ context.Context, p organization.Position) error {
	s.positions[p.ID] = p
	return nil
}

type policies struct{ *store }

func (s policies) Get(_ context.Context, id string) (organization.Policy, error) {
	return get(s.policies, id)
}

func (s policies) List(context.Context) ([]organization.Policy, error) { return nil, nil }

func (s policies) ListByIDs(_ context.Context, ids []string) ([]organization.Policy, error) {
	var out []organization.Policy
	for _, id := range ids {
		if p, ok := s.policies[id]; ok {
			out = append(out, p)
		}
	}
	return out, nil
}

func (s policies) Create(_ context.Context, p organization.Policy) error {
	s.policies[p.ID] = p
	return nil
}

type staffRepo struct{ *store }

func (s staffRepo) Create(_ context.Context, st staff.Staff, grants []staff.Grant) error {
	s.staff[st.ID] = staff.Detail{Summary: staff.Summary{Staff: st}}
	s.grants[st.ID] = grants
	return nil
}

func (s staffRepo) Get(_ context.Context, id string) (staff.Detail, error) { return get(s.staff, id) }

func (s staffRepo) ListByFacility(context.Context, string, staff.ListQuery) ([]staff.Summary, error) {
	return nil, nil
}

func (s staffRepo) FindIDBySub(_ context.Context, sub string) (string, error) {
	for id, d := range s.staff {
		if d.Sub != nil && *d.Sub == sub {
			return id, nil
		}
	}
	return "", domain.ErrNotFound
}

func (s staffRepo) LinkSub(_ context.Context, facilityID, email, sub string) error {
	for id, d := range s.staff {
		if d.FacilityID == facilityID && d.Email == email && d.Sub == nil {
			d.Sub = &sub
			s.staff[id] = d
		}
	}
	return nil
}

type patients struct{ *store }

func (s patients) Create(_ context.Context, p patient.Patient) error {
	s.patients[p.ID] = patient.Detail{Patient: p}
	return nil
}

func (s patients) Get(_ context.Context, id string) (patient.Detail, error) {
	return get(s.patients, id)
}

func (s patients) ListByFacility(context.Context, string, patient.ListQuery) ([]patient.Detail, error) {
	return nil, nil
}

type visits struct{ *store }

func (s visits) CreateInfo(_ context.Context, i visit.Info) error {
	s.infos[i.ID] = i
	return nil
}

func (s visits) DeleteInfoIfUnused(_ context.Context, id string) error {
	for _, d := range s.schedules {
		if d.VisitInfoID != nil && *d.VisitInfoID == id {
			return nil
		}
	}
	delete(s.infos, id)
	return nil
}

func (s visits) GetServiceCode(_ context.Context, id string) (visit.ServiceCode, error) {
	return get(s.codes, id)
}

func (s visits) ListServiceCodes(context.Context) ([]visit.ServiceCode, error) { return nil, nil }

func (s visits) ListCategories(context.Context) ([]visit.Category, error) { return nil, nil }

func (s visits) ListCategoriesByIDs(_ context.Context, ids []string) ([]visit.Category, error) {
	var out []visit.Category
	for _, id := range ids {
		if c, ok := s.categories[id]; ok {
			out = append(out, c)
		}
	}
	return out, nil
}

type schedules struct{ *store }

func (s schedules) GetType(_ context.Context, id string) (schedule.Type, error) {
	return get(s.types, id)
}

func (s schedules) ListTypes(context.Context) ([]schedule.Type, error) { return nil, nil }

func (s schedules) Create(_ context.Context, sc schedule.Schedule) error {
	s.schedules[sc.ID] = schedule.Detail{Schedule: sc, TypeName: s.types[sc.TypeID].Name}
	return nil
}

func (s schedules) Lock(_ context.Context, id string) error {
	_, err := get(s.schedules, id)
	return err
}

func (s schedules) Update(_ context.Context, sc schedule.Schedule) error {
	cur, ok := s.schedules[sc.ID]
	if !ok {
		return domain.ErrNotFound
	}
	sc.RecurringScheduleID = cur.RecurringScheduleID
	s.schedules[sc.ID] = schedule.Detail{Schedule: sc, TypeName: s.types[sc.TypeID].Name}
	return nil
}

func (s schedules) Get(_ context.Context, id string) (schedule.Detail, error) {
	d, err := get(s.schedules, id)
	if c, ok := s.cancels[id]; ok {
		d.Cancel = &c
	}
	return d, err
}

func (s schedules) ListByFacility(context.Context, string, schedule.ListQuery) ([]schedule.Detail, error) {
	return nil, nil
}

func (s schedules) CreateRecurring(_ context.Context, rs schedule.RecurringSchedule) error {
	s.recurring[rs.ID] = schedule.RecurringDetail{RecurringSchedule: rs, TypeName: s.types[rs.TypeID].Name}
	return nil
}

func (s schedules) GetRecurring(_ context.Context, id string) (schedule.RecurringDetail, error) {
	return get(s.recurring, id)
}

func (s schedules) ListRecurringByFacility(context.Context, string, schedule.ListQuery) ([]schedule.RecurringDetail, error) {
	return nil, nil
}

func (s schedules) AddExclusion(_ context.Context, id string, d civil.Date) error {
	rs := s.recurring[id]
	for _, e := range rs.ExclusionDates {
		if e == d {
			return domain.ErrConflict
		}
	}
	rs.ExclusionDates = append(rs.ExclusionDates, d)
	s.recurring[id] = rs
	return nil
}

func (s schedules) CreateCancel(_ context.Context, c schedule.Cancel) error {
	if _, ok := s.cancels[c.ScheduleID]; ok {
		return domain.ErrConflict
	}
	s.cancels[c.ScheduleID] = c
	return nil
}
