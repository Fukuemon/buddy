package organization

import (
	"context"

	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain"
)

// Repositories は、Service が使うリポジトリである。
type Repositories struct {
	Facilities  FacilityRepository
	Departments DepartmentRepository
	Teams       TeamRepository
	Positions   PositionRepository
	Policies    PolicyRepository
}

// Guard は、ctx の職員が職員の管理（StaffManage）を許されているかを確かめ、許されないときは domain.ErrForbidden を返す。
// auth が organization と staff に依存するので、機能のパッケージは auth の判定を import せずに受け取る（ADR-0006）。
type Guard func(ctx context.Context) error

// Service は、事業所、部署、チーム、役職、権限の操作である。
// 事業所ごとの一覧は、事業所が見つからないときに domain.ErrNotFound を返す。
// 役職の作成は、役職の既定で権限を配るので、guard が許すときだけ行う。
type Service struct {
	repos Repositories
	tx    domain.Transactor
	ids   domain.IDGenerator
	guard Guard
}

// NewService は Service を作る。
func NewService(repos Repositories, tx domain.Transactor, ids domain.IDGenerator, guard Guard) *Service {
	return &Service{repos: repos, tx: tx, ids: ids, guard: guard}
}

// GetFacility は、事業所を返す。
func (o *Service) GetFacility(ctx context.Context, id string) (Facility, error) {
	return o.repos.Facilities.Get(ctx, id)
}

// GetDepartment は、部署を返す。
func (o *Service) GetDepartment(ctx context.Context, id string) (Department, error) {
	return o.repos.Departments.Get(ctx, id)
}

// ListDepartments は、事業所の部署を返す。
func (o *Service) ListDepartments(ctx context.Context, facilityID string) ([]Department, error) {
	if _, err := o.repos.Facilities.Get(ctx, facilityID); err != nil {
		return nil, err
	}
	return o.repos.Departments.ListByFacility(ctx, facilityID)
}

// GetTeam は、チームを返す。
func (o *Service) GetTeam(ctx context.Context, id string) (Team, error) {
	return o.repos.Teams.Get(ctx, id)
}

// ListTeams は、事業所のチームを返す。
func (o *Service) ListTeams(ctx context.Context, facilityID string) ([]Team, error) {
	if _, err := o.repos.Facilities.Get(ctx, facilityID); err != nil {
		return nil, err
	}
	return o.repos.Teams.ListByFacility(ctx, facilityID)
}

// CreateTeam は、事業所にチームを作り、保存したチームを返す。
func (o *Service) CreateTeam(ctx context.Context, facilityID, name string) (Team, error) {
	if _, err := o.repos.Facilities.Get(ctx, facilityID); err != nil {
		return Team{}, err
	}
	t, err := NewTeam(o.ids.NewID(), facilityID, name)
	if err != nil {
		return Team{}, err
	}
	if err := o.repos.Teams.Create(ctx, t); err != nil {
		return Team{}, err
	}
	return o.repos.Teams.Get(ctx, t.ID)
}

// GetPosition は、役職と既定の権限を返す。
func (o *Service) GetPosition(ctx context.Context, id string) (Position, error) {
	return o.repos.Positions.Get(ctx, id)
}

// ListPositions は、事業所の役職を返す。
func (o *Service) ListPositions(ctx context.Context, facilityID string) ([]Position, error) {
	if _, err := o.repos.Facilities.Get(ctx, facilityID); err != nil {
		return nil, err
	}
	return o.repos.Positions.ListByFacility(ctx, facilityID)
}

// CreatePosition は、事業所に役職を作り、保存した役職を返す。policyIDs に見つからない権限があると入力の誤りを、職員の管理の権限が無いときは domain.ErrForbidden を返す。
func (o *Service) CreatePosition(ctx context.Context, facilityID, name string, policyIDs []string) (Position, error) {
	if err := o.guard(ctx); err != nil {
		return Position{}, err
	}
	if _, err := o.repos.Facilities.Get(ctx, facilityID); err != nil {
		return Position{}, err
	}
	policies, err := o.repos.Policies.ListByIDs(ctx, policyIDs)
	if err != nil {
		return Position{}, err
	}
	found := make(map[string]bool, len(policies))
	for _, p := range policies {
		found[p.ID] = true
	}
	for _, id := range policyIDs {
		if !found[id] {
			return Position{}, domain.Invalid("権限 %s が見つかりません", id)
		}
	}
	p, err := NewPosition(o.ids.NewID(), facilityID, name, policies)
	if err != nil {
		return Position{}, err
	}
	var created Position
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
func (o *Service) GetPolicy(ctx context.Context, id string) (Policy, error) {
	return o.repos.Policies.Get(ctx, id)
}

// ListPolicies は、すべての権限を返す。
func (o *Service) ListPolicies(ctx context.Context) ([]Policy, error) {
	return o.repos.Policies.List(ctx)
}
