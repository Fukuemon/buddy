package mysql

import (
	"context"
	"database/sql"

	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain/organization"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/infrastructure/mysql/sqlcgen"
)

// FacilityRepository は、organization.FacilityRepository を実装する。
type FacilityRepository struct{ conn }

// NewFacilityRepository は FacilityRepository を作る。
func NewFacilityRepository(db *sql.DB) *FacilityRepository { return &FacilityRepository{conn{db}} }

func (r *FacilityRepository) Get(ctx context.Context, id string) (organization.Facility, error) {
	f, err := r.q(ctx).GetFacility(ctx, id)
	if err != nil {
		return organization.Facility{}, translate("get facility", err)
	}
	return toFacility(f), nil
}

func (r *FacilityRepository) GetByOrgID(ctx context.Context, orgID string) (organization.Facility, error) {
	f, err := r.q(ctx).GetFacilityByOrgID(ctx, sql.NullString{String: orgID, Valid: true})
	if err != nil {
		return organization.Facility{}, translate("get facility by org", err)
	}
	return toFacility(f), nil
}

func toFacility(f sqlcgen.Facility) organization.Facility {
	return organization.Facility{ID: f.ID, Name: f.Name, CreatedAt: f.CreatedAt, UpdatedAt: f.UpdatedAt}
}

// DepartmentRepository は、organization.DepartmentRepository を実装する。
type DepartmentRepository struct{ conn }

// NewDepartmentRepository は DepartmentRepository を作る。
func NewDepartmentRepository(db *sql.DB) *DepartmentRepository {
	return &DepartmentRepository{conn{db}}
}

func (r *DepartmentRepository) Get(ctx context.Context, id string) (organization.Department, error) {
	d, err := r.q(ctx).GetDepartment(ctx, id)
	if err != nil {
		return organization.Department{}, translate("get department", err)
	}
	return organization.Department(d), nil
}

func (r *DepartmentRepository) ListByFacility(ctx context.Context, facilityID string) ([]organization.Department, error) {
	rows, err := r.q(ctx).ListDepartmentsByFacility(ctx, facilityID)
	if err != nil {
		return nil, translate("list departments", err)
	}
	out := make([]organization.Department, len(rows))
	for i, d := range rows {
		out[i] = organization.Department(d)
	}
	return out, nil
}

// TeamRepository は、organization.TeamRepository を実装する。
type TeamRepository struct{ conn }

// NewTeamRepository は TeamRepository を作る。
func NewTeamRepository(db *sql.DB) *TeamRepository { return &TeamRepository{conn{db}} }

func (r *TeamRepository) Get(ctx context.Context, id string) (organization.Team, error) {
	t, err := r.q(ctx).GetTeam(ctx, id)
	if err != nil {
		return organization.Team{}, translate("get team", err)
	}
	return organization.Team(t), nil
}

func (r *TeamRepository) ListByFacility(ctx context.Context, facilityID string) ([]organization.Team, error) {
	rows, err := r.q(ctx).ListTeamsByFacility(ctx, facilityID)
	if err != nil {
		return nil, translate("list teams", err)
	}
	out := make([]organization.Team, len(rows))
	for i, t := range rows {
		out[i] = organization.Team(t)
	}
	return out, nil
}

func (r *TeamRepository) Create(ctx context.Context, t organization.Team) error {
	err := r.q(ctx).CreateTeam(ctx, sqlcgen.CreateTeamParams{ID: t.ID, FacilityID: t.FacilityID, Name: t.Name})
	return translate("create team", err)
}

// PositionRepository は、organization.PositionRepository を実装する。
type PositionRepository struct{ conn }

// NewPositionRepository は PositionRepository を作る。
func NewPositionRepository(db *sql.DB) *PositionRepository { return &PositionRepository{conn{db}} }

func (r *PositionRepository) Get(ctx context.Context, id string) (organization.Position, error) {
	p, err := r.q(ctx).GetPosition(ctx, id)
	if err != nil {
		return organization.Position{}, translate("get position", err)
	}
	out, err := r.withPolicies(ctx, []sqlcgen.Position{p})
	if err != nil {
		return organization.Position{}, err
	}
	return out[0], nil
}

func (r *PositionRepository) ListByFacility(ctx context.Context, facilityID string) ([]organization.Position, error) {
	rows, err := r.q(ctx).ListPositionsByFacility(ctx, facilityID)
	if err != nil {
		return nil, translate("list positions", err)
	}
	return r.withPolicies(ctx, rows)
}

func (r *PositionRepository) withPolicies(ctx context.Context, rows []sqlcgen.Position) ([]organization.Position, error) {
	if len(rows) == 0 {
		return []organization.Position{}, nil
	}
	ids := make([]string, len(rows))
	for i, p := range rows {
		ids[i] = p.ID
	}
	links, err := r.q(ctx).ListPoliciesByPositions(ctx, ids)
	if err != nil {
		return nil, translate("list position policies", err)
	}
	byPosition := make(map[string][]organization.Policy, len(rows))
	for _, l := range links {
		byPosition[l.PositionID] = append(byPosition[l.PositionID], policy(sqlcgen.Policy{
			ID: l.ID, Code: l.Code, Name: l.Name, NeedsTarget: l.NeedsTarget, CreatedAt: l.CreatedAt, UpdatedAt: l.UpdatedAt,
		}))
	}
	out := make([]organization.Position, len(rows))
	for i, p := range rows {
		policies := byPosition[p.ID]
		if policies == nil {
			policies = []organization.Policy{}
		}
		out[i] = organization.Position{
			ID: p.ID, FacilityID: p.FacilityID, Name: p.Name, Policies: policies,
			CreatedAt: p.CreatedAt, UpdatedAt: p.UpdatedAt,
		}
	}
	return out, nil
}

// Create は、役職と既定の権限を続けて書く。途中で失敗したときに残さないよう、呼び出し側がトランザクションの中で呼ぶ。
func (r *PositionRepository) Create(ctx context.Context, p organization.Position) error {
	q := r.q(ctx)
	if err := q.CreatePosition(ctx, sqlcgen.CreatePositionParams{ID: p.ID, FacilityID: p.FacilityID, Name: p.Name}); err != nil {
		return translate("create position", err)
	}
	for _, pol := range p.Policies {
		if err := q.AddPositionPolicy(ctx, sqlcgen.AddPositionPolicyParams{PositionID: p.ID, PolicyID: pol.ID}); err != nil {
			return translate("add position policy", err)
		}
	}
	return nil
}

// PolicyRepository は、organization.PolicyRepository を実装する。
type PolicyRepository struct{ conn }

// NewPolicyRepository は PolicyRepository を作る。
func NewPolicyRepository(db *sql.DB) *PolicyRepository { return &PolicyRepository{conn{db}} }

func (r *PolicyRepository) Get(ctx context.Context, id string) (organization.Policy, error) {
	p, err := r.q(ctx).GetPolicy(ctx, id)
	if err != nil {
		return organization.Policy{}, translate("get policy", err)
	}
	return policy(p), nil
}

func (r *PolicyRepository) List(ctx context.Context) ([]organization.Policy, error) {
	rows, err := r.q(ctx).ListPolicies(ctx)
	if err != nil {
		return nil, translate("list policies", err)
	}
	return policies(rows), nil
}

func (r *PolicyRepository) ListByIDs(ctx context.Context, ids []string) ([]organization.Policy, error) {
	if len(ids) == 0 {
		return []organization.Policy{}, nil
	}
	rows, err := r.q(ctx).ListPoliciesByIDs(ctx, ids)
	if err != nil {
		return nil, translate("list policies by ids", err)
	}
	return policies(rows), nil
}

func policies(rows []sqlcgen.Policy) []organization.Policy {
	out := make([]organization.Policy, len(rows))
	for i, p := range rows {
		out[i] = policy(p)
	}
	return out
}

func policy(p sqlcgen.Policy) organization.Policy {
	return organization.Policy{
		ID: p.ID, Code: organization.PolicyCode(p.Code), Name: p.Name, NeedsTarget: p.NeedsTarget,
		CreatedAt: p.CreatedAt, UpdatedAt: p.UpdatedAt,
	}
}
