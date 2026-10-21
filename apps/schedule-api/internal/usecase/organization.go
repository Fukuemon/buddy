package usecase

import (
	"context"

	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain/organization"
)

// OrganizationRepositories は、Organization が使うリポジトリである。
type OrganizationRepositories struct {
	Facilities  organization.FacilityRepository
	Departments organization.DepartmentRepository
	Teams       organization.TeamRepository
	Positions   organization.PositionRepository
	Policies    organization.PolicyRepository
}

// Organization は、事業所、部署、チーム、役職、権限の操作である。
// 事業所ごとの一覧は、事業所が見つからないときに domain.ErrNotFound を返す。
type Organization struct {
	repos OrganizationRepositories
	tx    domain.Transactor
	ids   domain.IDGenerator
}

// NewOrganization は Organization を作る。
func NewOrganization(repos OrganizationRepositories, tx domain.Transactor, ids domain.IDGenerator) *Organization {
	return &Organization{repos: repos, tx: tx, ids: ids}
}

// GetFacility は、事業所を返す。
func (o *Organization) GetFacility(ctx context.Context, id string) (organization.Facility, error) {
	return o.repos.Facilities.Get(ctx, id)
}

// GetDepartment は、部署を返す。
func (o *Organization) GetDepartment(ctx context.Context, id string) (organization.Department, error) {
	return o.repos.Departments.Get(ctx, id)
}

// ListDepartments は、事業所の部署を返す。
func (o *Organization) ListDepartments(ctx context.Context, facilityID string) ([]organization.Department, error) {
	if _, err := o.repos.Facilities.Get(ctx, facilityID); err != nil {
		return nil, err
	}
	return o.repos.Departments.ListByFacility(ctx, facilityID)
}

// GetTeam は、チームを返す。
func (o *Organization) GetTeam(ctx context.Context, id string) (organization.Team, error) {
	return o.repos.Teams.Get(ctx, id)
}

// ListTeams は、事業所のチームを返す。
func (o *Organization) ListTeams(ctx context.Context, facilityID string) ([]organization.Team, error) {
	if _, err := o.repos.Facilities.Get(ctx, facilityID); err != nil {
		return nil, err
	}
	return o.repos.Teams.ListByFacility(ctx, facilityID)
}

// CreateTeam は、事業所にチームを作り、保存したチームを返す。
func (o *Organization) CreateTeam(ctx context.Context, facilityID, name string) (organization.Team, error) {
	if _, err := o.repos.Facilities.Get(ctx, facilityID); err != nil {
		return organization.Team{}, err
	}
	t, err := organization.NewTeam(o.ids.NewID(), facilityID, name)
	if err != nil {
		return organization.Team{}, err
	}
	if err := o.repos.Teams.Create(ctx, t); err != nil {
		return organization.Team{}, err
	}
	return o.repos.Teams.Get(ctx, t.ID)
}

// GetPosition は、役職と既定の権限を返す。
func (o *Organization) GetPosition(ctx context.Context, id string) (organization.Position, error) {
	return o.repos.Positions.Get(ctx, id)
}

// ListPositions は、事業所の役職を返す。
func (o *Organization) ListPositions(ctx context.Context, facilityID string) ([]organization.Position, error) {
	if _, err := o.repos.Facilities.Get(ctx, facilityID); err != nil {
		return nil, err
	}
	return o.repos.Positions.ListByFacility(ctx, facilityID)
}

// CreatePosition は、事業所に役職を作り、保存した役職を返す。policyIDs に見つからない権限があると入力の誤りを返す。
func (o *Organization) CreatePosition(ctx context.Context, facilityID, name string, policyIDs []string) (organization.Position, error) {
	if _, err := o.repos.Facilities.Get(ctx, facilityID); err != nil {
		return organization.Position{}, err
	}
	policies, err := o.repos.Policies.ListByIDs(ctx, policyIDs)
	if err != nil {
		return organization.Position{}, err
	}
	found := make(map[string]bool, len(policies))
	for _, p := range policies {
		found[p.ID] = true
	}
	for _, id := range policyIDs {
		if !found[id] {
			return organization.Position{}, domain.Invalid("権限 %s が見つかりません", id)
		}
	}
	p, err := organization.NewPosition(o.ids.NewID(), facilityID, name, policies)
	if err != nil {
		return organization.Position{}, err
	}
	var created organization.Position
	err = o.tx.WithinTx(ctx, func(ctx context.Context) error {
		if err := o.repos.Positions.Create(ctx, p); err != nil {
			return err
		}
		created, err = o.repos.Positions.Get(ctx, p.ID)
		return err
	})
	return created, err
}

// GetPolicy は、権限を返す。
func (o *Organization) GetPolicy(ctx context.Context, id string) (organization.Policy, error) {
	return o.repos.Policies.Get(ctx, id)
}

// ListPolicies は、すべての権限を返す。
func (o *Organization) ListPolicies(ctx context.Context) ([]organization.Policy, error) {
	return o.repos.Policies.List(ctx)
}
