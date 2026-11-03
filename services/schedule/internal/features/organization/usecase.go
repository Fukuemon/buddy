package organization

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/kernel"
	"github.com/Fukuemon/buddy/services/schedule/internal/tx"
)

// Deps は、Usecase が使うリポジトリである。
type Deps struct {
	Facilities  FacilityRepository
	Departments DepartmentRepository
	Teams       TeamRepository
	Positions   PositionRepository
	Policies    PolicyRepository
}

// Guard は、ctx の職員が職員の管理（StaffManage）を許されているかを確認し、許されないときは apperr.ErrForbidden を返す。
// principal が organization と staff に依存するので、機能のパッケージは principal の判定を import せずに受け取る（ADR-0006）。
type Guard func(ctx context.Context) error

// Usecase は、事業所、部署、チーム、役職、権限の操作である。
// 事業所ごとの一覧は、事業所が見つからないときに apperr.ErrNotFound を返す。
// 役職とチームの作成は、guard が許すときだけ行う。役職はデフォルトの権限を職員に配り、チームはチームを対象にする権限の範囲を決めるためである。
type Usecase struct {
	deps  Deps
	tx    tx.Transactor
	ids   kernel.IDGenerator
	guard Guard
}

// NewUsecase は Usecase を作る。
func NewUsecase(deps Deps, tx tx.Transactor, ids kernel.IDGenerator, guard Guard) *Usecase {
	return &Usecase{deps: deps, tx: tx, ids: ids, guard: guard}
}

// GetFacility は、事業所 id を返す。見つからないときは apperr.ErrNotFound を返す。
func (o *Usecase) GetFacility(ctx context.Context, id string) (Facility, error) {
	return o.deps.Facilities.Get(ctx, id)
}

// GetDepartment は、部署 id を返す。見つからないときは apperr.ErrNotFound を返す。
func (o *Usecase) GetDepartment(ctx context.Context, id string) (Department, error) {
	return o.deps.Departments.Get(ctx, id)
}

// ListDepartments は、事業所 facilityID の全ての部署を返す。事業所が見つからないときは apperr.ErrNotFound を返す。
func (o *Usecase) ListDepartments(ctx context.Context, facilityID string) ([]Department, error) {
	if _, err := o.deps.Facilities.Get(ctx, facilityID); err != nil {
		return nil, err
	}
	return o.deps.Departments.ListByFacility(ctx, facilityID)
}

// CreateDepartment は、事業所に部署を作り、保存した部署を返す。職員の管理の権限が無いときは apperr.ErrForbidden を、
// 名前が不正なときは入力のエラーを、同じ事業所に同じ名前の部署があるときは apperr.ErrConflict を返す。
func (o *Usecase) CreateDepartment(ctx context.Context, facilityID, name string) (Department, error) {
	if err := o.guard(ctx); err != nil {
		return Department{}, err
	}
	if _, err := o.deps.Facilities.Get(ctx, facilityID); err != nil {
		return Department{}, err
	}
	d, err := NewDepartment(o.ids.NewID(), facilityID, name)
	if err != nil {
		return Department{}, err
	}
	if err := o.deps.Departments.Create(ctx, d); err != nil {
		return Department{}, apperr.AsConflict(err, "部署 %s はこの事業所にすでにあります", d.Name)
	}
	return o.deps.Departments.Get(ctx, d.ID)
}

// UpdateDepartment は、部署 id の名前を変え、変えた部署を返す。職員の管理の権限が無いときは apperr.ErrForbidden を、
// 名前が不正なときは入力のエラーを、同じ事業所にほかの同じ名前の部署があるときは apperr.ErrConflict を返す。
func (o *Usecase) UpdateDepartment(ctx context.Context, id, name string) (Department, error) {
	if err := o.guard(ctx); err != nil {
		return Department{}, err
	}
	cur, err := o.deps.Departments.Get(ctx, id)
	if err != nil {
		return Department{}, err
	}
	d, err := NewDepartment(cur.ID, cur.FacilityID, name)
	if err != nil {
		return Department{}, err
	}
	if err := o.deps.Departments.Update(ctx, d); err != nil {
		return Department{}, apperr.AsConflict(err, "部署 %s はこの事業所にすでにあります", d.Name)
	}
	return o.deps.Departments.Get(ctx, d.ID)
}

// GetTeam は、チーム id を返す。見つからないときは apperr.ErrNotFound を返す。
func (o *Usecase) GetTeam(ctx context.Context, id string) (Team, error) {
	return o.deps.Teams.Get(ctx, id)
}

// ListTeams は、事業所 facilityID の全てのチームを返す。事業所が見つからないときは apperr.ErrNotFound を返す。
func (o *Usecase) ListTeams(ctx context.Context, facilityID string) ([]Team, error) {
	if _, err := o.deps.Facilities.Get(ctx, facilityID); err != nil {
		return nil, err
	}
	return o.deps.Teams.ListByFacility(ctx, facilityID)
}

// CreateTeam は、事業所にチームを作り、保存したチームを返す。color が空なら NextTeamColor で事業所のチームの色から選ぶ。
// 職員の管理の権限が無いときは apperr.ErrForbidden を、color が 8 色にないときは入力のエラーを、
// 同じ事業所に同じ名前のチームがあるときは apperr.ErrConflict を返す。
func (o *Usecase) CreateTeam(ctx context.Context, facilityID, name string, color TeamColor) (Team, error) {
	if err := o.guard(ctx); err != nil {
		return Team{}, err
	}
	if _, err := o.deps.Facilities.Get(ctx, facilityID); err != nil {
		return Team{}, err
	}
	color, err := o.teamColorOf(ctx, facilityID, color)
	if err != nil {
		return Team{}, err
	}
	t, err := NewTeam(o.ids.NewID(), facilityID, name, color)
	if err != nil {
		return Team{}, err
	}
	if err := o.deps.Teams.Create(ctx, t); err != nil {
		return Team{}, apperr.AsConflict(err, "チーム %s はこの事業所にすでにあります", t.Name)
	}
	return o.deps.Teams.Get(ctx, t.ID)
}

// teamColorOf は、color が空でなければそのまま返し、空なら事業所 facilityID のチームが使っていない色を NextTeamColor で選ぶ。
func (o *Usecase) teamColorOf(ctx context.Context, facilityID string, color TeamColor) (TeamColor, error) {
	if color != "" {
		return color, nil
	}
	teams, err := o.deps.Teams.ListByFacility(ctx, facilityID)
	if err != nil {
		return "", err
	}
	used := make([]TeamColor, len(teams))
	for i, t := range teams {
		used[i] = t.Color
	}
	return NextTeamColor(used), nil
}

// UpdateTeam は、チーム id の名前と色を変え、変えたチームを返す。職員の管理の権限が無いときは apperr.ErrForbidden を、
// 名前か色が不正なときは入力のエラーを、同じ事業所にほかの同じ名前のチームがあるときは apperr.ErrConflict を返す。
func (o *Usecase) UpdateTeam(ctx context.Context, id, name string, color TeamColor) (Team, error) {
	if err := o.guard(ctx); err != nil {
		return Team{}, err
	}
	cur, err := o.deps.Teams.Get(ctx, id)
	if err != nil {
		return Team{}, err
	}
	t, err := NewTeam(cur.ID, cur.FacilityID, name, color)
	if err != nil {
		return Team{}, err
	}
	if err := o.deps.Teams.Update(ctx, t); err != nil {
		return Team{}, apperr.AsConflict(err, "チーム %s はこの事業所にすでにあります", t.Name)
	}
	return o.deps.Teams.Get(ctx, t.ID)
}

// GetPosition は、役職 id を、デフォルトの権限とともに返す。見つからないときは apperr.ErrNotFound を返す。
func (o *Usecase) GetPosition(ctx context.Context, id string) (Position, error) {
	return o.deps.Positions.Get(ctx, id)
}

// ListPositions は、事業所 facilityID の全ての役職を、デフォルトの権限とともに返す。
// 事業所が見つからないときは apperr.ErrNotFound を返す。
func (o *Usecase) ListPositions(ctx context.Context, facilityID string) ([]Position, error) {
	if _, err := o.deps.Facilities.Get(ctx, facilityID); err != nil {
		return nil, err
	}
	return o.deps.Positions.ListByFacility(ctx, facilityID)
}

// CreatePosition は、事業所に役職を作り、保存した役職を返す。policyIDs に見つからない権限があると入力のエラーを、職員の管理の権限が無いときは apperr.ErrForbidden を、
// 同じ事業所に同じ名前の役職があるときは apperr.ErrConflict を返す。
func (o *Usecase) CreatePosition(ctx context.Context, facilityID, name string, policyIDs []string) (Position, error) {
	if err := o.guard(ctx); err != nil {
		return Position{}, err
	}
	if _, err := o.deps.Facilities.Get(ctx, facilityID); err != nil {
		return Position{}, err
	}
	policies, err := o.requirePolicies(ctx, policyIDs)
	if err != nil {
		return Position{}, err
	}
	p, err := NewPosition(o.ids.NewID(), facilityID, name, policies)
	if err != nil {
		return Position{}, err
	}
	return o.savePosition(ctx, p)
}

// requirePolicies は、ids の全ての権限を返す。見つからない権限が 1 つでもあれば、その ID を書いた入力のエラーを返す。
func (o *Usecase) requirePolicies(ctx context.Context, ids []string) ([]Policy, error) {
	policies, err := o.deps.Policies.ListByIDs(ctx, ids)
	if err != nil {
		return nil, err
	}
	found := make(map[string]bool, len(policies))
	for _, p := range policies {
		found[p.ID] = true
	}
	for _, id := range ids {
		if !found[id] {
			return nil, apperr.Invalid("権限 %s が見つかりません", id)
		}
	}
	return policies, nil
}

// savePosition は、1 つのトランザクションで役職 p を保存して読み直す。同じ事業所に同じ名前の役職があるときは apperr.ErrConflict を返す。
func (o *Usecase) savePosition(ctx context.Context, p Position) (Position, error) {
	var created Position
	err := o.tx.WithinTx(ctx, func(ctx context.Context) error {
		if err := o.deps.Positions.Create(ctx, p); err != nil {
			return apperr.AsConflict(err, "役職 %s はこの事業所にすでにあります", p.Name)
		}
		var err error
		created, err = o.deps.Positions.Get(ctx, p.ID)
		return err
	})
	return created, err
}

// GetPolicy は、権限 id を返す。見つからないときは apperr.ErrNotFound を返す。
func (o *Usecase) GetPolicy(ctx context.Context, id string) (Policy, error) {
	return o.deps.Policies.Get(ctx, id)
}

// ListPolicies は、全ての権限を返す。権限は事業所ごとに持たないので、事業所を受けない。
func (o *Usecase) ListPolicies(ctx context.Context) ([]Policy, error) {
	return o.deps.Policies.List(ctx)
}
