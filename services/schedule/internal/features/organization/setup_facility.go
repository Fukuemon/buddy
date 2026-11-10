package organization

import (
	"context"
	"errors"
	"slices"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/kernel"
)

// SetupFacilityInput は、事業所を足す入力である。OrgID は、ブローカーの上流の IdP の設定の組織の ID である。
// DepartmentName と TeamName は、最初の職員を所属させる部署とチームの名前である。
type SetupFacilityInput struct {
	OrgID          string
	Name           string
	DepartmentName string
	TeamName       string
}

// FacilitySetup は、SetupFacility が書いたか、既にあったものである。Created の付く値は、この呼び出しで作ったかを示す。
// ManagerPosition は、職員の管理の権限をデフォルトに持つ役職で、最初の職員に付ける。
type FacilitySetup struct {
	Facility          Facility
	FacilityCreated   bool
	Positions         []Position
	CreatedPositions  []string
	ManagerPosition   Position
	Department        Department
	DepartmentCreated bool
	Team              Team
	TeamCreated       bool
}

// SetupFacility は、事業所と、標準の 4 つの役職と、最初の職員の部署とチームを、無ければ作る。運営用の CLI が使う。
type SetupFacility struct {
	facilities  FacilityRepository
	creator     FacilityCreator
	departments DepartmentRepository
	teams       TeamRepository
	positions   PositionRepository
	policies    PolicyRepository
	ids         kernel.IDGenerator
}

// NewSetupFacility は SetupFacility を作る。
func NewSetupFacility(facilities FacilityRepository, creator FacilityCreator, departments DepartmentRepository, teams TeamRepository, positions PositionRepository, policies PolicyRepository, ids kernel.IDGenerator) SetupFacility {
	return SetupFacility{facilities: facilities, creator: creator, departments: departments, teams: teams, positions: positions, policies: policies, ids: ids}
}

// Do は、組織の ID が in.OrgID の事業所を、無ければ作り、あれば使う。呼び出し側がトランザクションの中で呼ぶ。
//
//   - 事業所を作ったときは、標準の 4 つの役職をデフォルトの権限とともに作る。予定の正本は、新しい事業所のデフォルト（google_primary）にする。
//   - 事業所があったときは、役職を作らず、職員の管理の権限をデフォルトに持つ役職を使う。役職の名前は事業所ごとに変えてよいためである。
//     その役職が無いときは apperr.ErrConflict を返す。名前が in.Name と違うときは、名前を変えずに apperr.ErrConflict を返す。
//   - 部署とチームは、同じ名前があれば使い、無ければ作る。チームの色は NextTeamColor で選ぶ。
//
// 入力が誤っているときは入力のエラーを返す。
func (o SetupFacility) Do(ctx context.Context, in SetupFacilityInput) (FacilitySetup, error) {
	if err := kernel.ValidateText("組織の ID", in.OrgID, maxNameLen); err != nil {
		return FacilitySetup{}, err
	}
	if err := kernel.ValidateText("事業所の名前", in.Name, maxNameLen); err != nil {
		return FacilitySetup{}, err
	}
	var out FacilitySetup
	f, err := o.facilities.GetByOrgID(ctx, in.OrgID)
	switch {
	case errors.Is(err, apperr.ErrNotFound):
		if f, err = o.createFacility(ctx, in); err != nil {
			return FacilitySetup{}, err
		}
		out.FacilityCreated = true
	case err != nil:
		return FacilitySetup{}, err
	case f.Name != in.Name:
		return FacilitySetup{}, apperr.Conflict("組織 %s の事業所は %s として登録されています。名前を変えずに止めます", in.OrgID, f.Name)
	}
	out.Facility = f
	if out.FacilityCreated {
		if out.Positions, err = o.createStandardPositions(ctx, f.ID); err != nil {
			return FacilitySetup{}, err
		}
		for _, p := range out.Positions {
			out.CreatedPositions = append(out.CreatedPositions, p.Name)
		}
	} else if out.Positions, err = o.positions.ListByFacility(ctx, f.ID); err != nil {
		return FacilitySetup{}, err
	}
	i := slices.IndexFunc(out.Positions, func(p Position) bool {
		return slices.ContainsFunc(p.Policies, func(pol Policy) bool { return pol.Code == StaffManage })
	})
	if i < 0 {
		return FacilitySetup{}, apperr.Conflict("事業所 %s に、職員の管理の権限をデフォルトに持つ役職がありません", f.ID)
	}
	out.ManagerPosition = out.Positions[i]
	if out.Department, out.DepartmentCreated, err = o.findOrCreateDepartment(ctx, f.ID, in.DepartmentName); err != nil {
		return FacilitySetup{}, err
	}
	if out.Team, out.TeamCreated, err = o.findOrCreateTeam(ctx, f.ID, in.TeamName); err != nil {
		return FacilitySetup{}, err
	}
	return out, nil
}

func (o SetupFacility) createFacility(ctx context.Context, in SetupFacilityInput) (Facility, error) {
	f := Facility{ID: o.ids.NewID(), Name: in.Name, OrgID: in.OrgID, SourceMode: SourceGooglePrimary}
	if err := o.creator.Create(ctx, f); err != nil {
		return Facility{}, apperr.AsConflict(err, "組織 %s の事業所はすでにあります", in.OrgID)
	}
	return o.facilities.Get(ctx, f.ID)
}

// createStandardPositions は、事業所 facilityID に標準の 4 つの役職を作り、StandardPositions の順に返す。
func (o SetupFacility) createStandardPositions(ctx context.Context, facilityID string) ([]Position, error) {
	all, err := o.policies.List(ctx)
	if err != nil {
		return nil, err
	}
	var out []Position
	for _, sp := range StandardPositions() {
		var policies []Policy
		for _, code := range sp.Policies {
			i := slices.IndexFunc(all, func(p Policy) bool { return p.Code == code })
			if i < 0 {
				return nil, errors.New("権限 " + string(code) + " のレコードがありません")
			}
			policies = append(policies, all[i])
		}
		p, err := NewPosition(o.ids.NewID(), facilityID, sp.Name, policies)
		if err != nil {
			return nil, err
		}
		if err := o.positions.Create(ctx, p); err != nil {
			return nil, apperr.AsConflict(err, "役職 %s はこの事業所にすでにあります", p.Name)
		}
		if p, err = o.positions.Get(ctx, p.ID); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, nil
}

// findOrCreateDepartment は、事業所 facilityID の名前が name の部署を返す。無ければ作り、作ったかを返す。
func (o SetupFacility) findOrCreateDepartment(ctx context.Context, facilityID, name string) (Department, bool, error) {
	deps, err := o.departments.ListByFacility(ctx, facilityID)
	if err != nil {
		return Department{}, false, err
	}
	if i := slices.IndexFunc(deps, func(d Department) bool { return d.Name == name }); i >= 0 {
		return deps[i], false, nil
	}
	d, err := NewDepartment(o.ids.NewID(), facilityID, name)
	if err != nil {
		return Department{}, false, err
	}
	if err := o.departments.Create(ctx, d); err != nil {
		return Department{}, false, apperr.AsConflict(err, "部署 %s はこの事業所にすでにあります", d.Name)
	}
	d, err = o.departments.Get(ctx, d.ID)
	return d, err == nil, err
}

// findOrCreateTeam は、事業所 facilityID の名前が name のチームを返す。無ければ NextTeamColor の色で作り、作ったかを返す。
func (o SetupFacility) findOrCreateTeam(ctx context.Context, facilityID, name string) (Team, bool, error) {
	teams, err := o.teams.ListByFacility(ctx, facilityID)
	if err != nil {
		return Team{}, false, err
	}
	if i := slices.IndexFunc(teams, func(t Team) bool { return t.Name == name }); i >= 0 {
		return teams[i], false, nil
	}
	used := make([]TeamColor, len(teams))
	for i, t := range teams {
		used[i] = t.Color
	}
	t, err := NewTeam(o.ids.NewID(), facilityID, name, NextTeamColor(used))
	if err != nil {
		return Team{}, false, err
	}
	if err := o.teams.Create(ctx, t); err != nil {
		return Team{}, false, apperr.AsConflict(err, "チーム %s はこの事業所にすでにあります", t.Name)
	}
	t, err = o.teams.Get(ctx, t.ID)
	return t, err == nil, err
}
