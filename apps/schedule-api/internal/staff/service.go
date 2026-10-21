package staff

import (
	"context"

	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/organization"
)

// Repositories は、Service が使うリポジトリである。
type Repositories struct {
	Facilities  organization.FacilityRepository
	Departments organization.DepartmentRepository
	Teams       organization.TeamRepository
	Positions   organization.PositionRepository
	Policies    organization.PolicyRepository
	Staff       Repository
}

// Guard は、ctx の職員が職員の管理を許されているかを確かめ、許されないときは domain.ErrForbidden を返す。
// auth が staff に依存するので、staff は auth の判定を import せずに受け取る。
type Guard func(ctx context.Context) error

// Service は、職員の操作である。職員の登録と、職員の権限と役職を変える操作は、guard が許すときだけ行う（ADR-0006）。
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

// CreateInput は、職員の作成の入力である。
type CreateInput struct {
	FacilityID   string
	Username     string
	Email        string
	PhoneNumber  *string
	DepartmentID string
	TeamID       string
	PositionID   string
}

// Create は、職員を作り、役職の既定の権限を与える。チームを対象にする権限は、職員の所属のチームを対象にする。事業所が見つからないときは domain.ErrNotFound を、
// 部署、チーム、役職が見つからないか別の事業所のものであるときは入力の誤りを、職員の管理の権限が無いときは domain.ErrForbidden を返す。
func (s *Service) Create(ctx context.Context, in CreateInput) (Detail, error) {
	if err := s.guard(ctx); err != nil {
		return Detail{}, err
	}
	if _, err := s.repos.Facilities.Get(ctx, in.FacilityID); err != nil {
		return Detail{}, err
	}
	dep, err := s.repos.Departments.Get(ctx, in.DepartmentID)
	if err != nil {
		return Detail{}, domain.Reference("部署", in.DepartmentID, err)
	}
	if err := domain.SameFacility("部署", dep.ID, dep.FacilityID, in.FacilityID); err != nil {
		return Detail{}, err
	}
	team, err := s.repos.Teams.Get(ctx, in.TeamID)
	if err != nil {
		return Detail{}, domain.Reference("チーム", in.TeamID, err)
	}
	if err := domain.SameFacility("チーム", team.ID, team.FacilityID, in.FacilityID); err != nil {
		return Detail{}, err
	}
	pos, err := s.repos.Positions.Get(ctx, in.PositionID)
	if err != nil {
		return Detail{}, domain.Reference("役職", in.PositionID, err)
	}
	if err := domain.SameFacility("役職", pos.ID, pos.FacilityID, in.FacilityID); err != nil {
		return Detail{}, err
	}
	st, err := New(NewParams{
		ID:           s.ids.NewID(),
		Username:     in.Username,
		Email:        in.Email,
		PhoneNumber:  in.PhoneNumber,
		FacilityID:   in.FacilityID,
		DepartmentID: dep.ID,
		TeamID:       team.ID,
		PositionID:   pos.ID,
	})
	if err != nil {
		return Detail{}, err
	}
	grants := s.defaultGrants(pos, team.ID)
	var created Detail
	err = s.tx.WithinTx(ctx, func(ctx context.Context) error {
		if err := s.repos.Staff.Create(ctx, st, grants); err != nil {
			return err
		}
		created, err = s.repos.Staff.Get(ctx, st.ID)
		return err
	})
	return created, err
}

// ChangePosition は、職員の役職を positionID にし、職員の権限を新しい役職の既定で写し直す。
// ADR-0002 のとおり、職員ごとに足した権限と対象は消える。職員が見つからないときは domain.ErrNotFound を、
// 役職が見つからないか別の事業所のものであるときは入力の誤りを返す。
func (s *Service) ChangePosition(ctx context.Context, id, positionID string) (Detail, error) {
	if err := s.guard(ctx); err != nil {
		return Detail{}, err
	}
	var changed Detail
	err := s.tx.WithinTx(ctx, func(ctx context.Context) error {
		cur, err := s.repos.Staff.Get(ctx, id)
		if err != nil {
			return err
		}
		pos, err := s.repos.Positions.Get(ctx, positionID)
		if err != nil {
			return domain.Reference("役職", positionID, err)
		}
		if err := domain.SameFacility("役職", pos.ID, pos.FacilityID, cur.FacilityID); err != nil {
			return err
		}
		if err := s.repos.Staff.ChangePosition(ctx, cur.ID, pos.ID, s.defaultGrants(pos, cur.TeamID)); err != nil {
			return err
		}
		changed, err = s.repos.Staff.Get(ctx, cur.ID)
		return err
	})
	return changed, err
}

// GrantInput は、職員に足す権限と対象である。対象は、権限の code に合わせて職員かチームを指定する。
type GrantInput struct {
	PolicyID      string
	TargetUserIDs []string
	TargetTeamIDs []string
}

// AddGrant は、職員に権限を 1 つ足す。対象を指定する権限には、職員を対象にする権限なら職員を、
// チームを対象にする権限ならチームを 1 つ以上指定する。対象を指定しない権限には、対象を指定できない。
// 職員が見つからないときは domain.ErrNotFound を、権限、対象が合わないか別の事業所のものであるときは入力の誤りを、
// 同じ権限が既にあるときは domain.ErrConflict を返す。
func (s *Service) AddGrant(ctx context.Context, id string, in GrantInput) (Detail, error) {
	if err := s.guard(ctx); err != nil {
		return Detail{}, err
	}
	var changed Detail
	err := s.tx.WithinTx(ctx, func(ctx context.Context) error {
		cur, err := s.repos.Staff.Get(ctx, id)
		if err != nil {
			return err
		}
		p, err := s.repos.Policies.Get(ctx, in.PolicyID)
		if err != nil {
			return domain.Reference("権限", in.PolicyID, err)
		}
		g := Grant{ID: s.ids.NewID(), PolicyID: p.ID}
		g.Targets, err = s.targets(ctx, p, cur.FacilityID, in)
		if err != nil {
			return err
		}
		if err := s.repos.Staff.AddGrant(ctx, cur.ID, g); err != nil {
			return err
		}
		changed, err = s.repos.Staff.Get(ctx, cur.ID)
		return err
	})
	return changed, err
}

// targets は、権限 p の対象を確かめ、同じ事業所 facilityID の職員かチームの対象を作る。
func (s *Service) targets(ctx context.Context, p organization.Policy, facilityID string, in GrantInput) ([]Target, error) {
	users, teams := in.TargetUserIDs, in.TargetTeamIDs
	switch {
	case !p.NeedsTarget:
		if len(users) > 0 || len(teams) > 0 {
			return nil, domain.Invalid("権限 %s は対象を指定できません", p.ID)
		}
		return nil, nil
	case p.Code.TargetsTeam():
		if len(teams) == 0 || len(users) > 0 {
			return nil, domain.Invalid("権限 %s にはチームの対象だけを 1 つ以上指定します", p.ID)
		}
	default:
		if len(users) == 0 || len(teams) > 0 {
			return nil, domain.Invalid("権限 %s には職員の対象だけを 1 つ以上指定します", p.ID)
		}
	}
	out := make([]Target, 0, len(users)+len(teams))
	seen := make(map[string]bool, cap(out))
	for _, uid := range users {
		st, err := s.repos.Staff.Get(ctx, uid)
		if err != nil {
			return nil, domain.Reference("職員", uid, err)
		}
		if err := domain.SameFacility("職員", st.ID, st.FacilityID, facilityID); err != nil {
			return nil, err
		}
		if seen[uid] {
			return nil, domain.Invalid("職員 %s が重なっています", uid)
		}
		seen[uid] = true
		out = append(out, Target{ID: s.ids.NewID(), UserID: st.ID})
	}
	for _, tid := range teams {
		t, err := s.repos.Teams.Get(ctx, tid)
		if err != nil {
			return nil, domain.Reference("チーム", tid, err)
		}
		if err := domain.SameFacility("チーム", t.ID, t.FacilityID, facilityID); err != nil {
			return nil, err
		}
		if seen[tid] {
			return nil, domain.Invalid("チーム %s が重なっています", tid)
		}
		seen[tid] = true
		out = append(out, Target{ID: s.ids.NewID(), TeamID: t.ID})
	}
	return out, nil
}

// RemoveGrant は、職員の権限 userPolicyID と、その対象を外す。
// 職員か、職員のその権限が見つからないときは domain.ErrNotFound を返す。
func (s *Service) RemoveGrant(ctx context.Context, id, userPolicyID string) (Detail, error) {
	if err := s.guard(ctx); err != nil {
		return Detail{}, err
	}
	var changed Detail
	err := s.tx.WithinTx(ctx, func(ctx context.Context) error {
		if err := s.repos.Staff.RemoveGrant(ctx, id, userPolicyID); err != nil {
			return err
		}
		var err error
		changed, err = s.repos.Staff.Get(ctx, id)
		return err
	})
	return changed, err
}

// defaultGrants は、役職の既定の権限から、職員に与える権限を作る。
// ADR-0002 のとおり、チームを対象にする権限は、職員の所属のチーム teamID を対象にする。
func (s *Service) defaultGrants(pos organization.Position, teamID string) []Grant {
	grants := make([]Grant, 0, len(pos.Policies))
	for _, p := range pos.Policies {
		g := Grant{ID: s.ids.NewID(), PolicyID: p.ID}
		if p.Code.TargetsTeam() {
			g.Targets = []Target{{ID: s.ids.NewID(), TeamID: teamID}}
		}
		grants = append(grants, g)
	}
	return grants
}

// Get は、職員と権限を返す。
func (s *Service) Get(ctx context.Context, id string) (Detail, error) {
	return s.repos.Staff.Get(ctx, id)
}

// List は、事業所の職員を返す。事業所が見つからないときは domain.ErrNotFound を返す。
func (s *Service) List(ctx context.Context, facilityID string, q ListQuery) ([]Summary, error) {
	if _, err := s.repos.Facilities.Get(ctx, facilityID); err != nil {
		return nil, err
	}
	return s.repos.Staff.ListByFacility(ctx, facilityID, q)
}
