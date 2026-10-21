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
	Staff       Repository
}

// Service は、職員の操作である。
type Service struct {
	repos Repositories
	tx    domain.Transactor
	ids   domain.IDGenerator
}

// NewService は Service を作る。
func NewService(repos Repositories, tx domain.Transactor, ids domain.IDGenerator) *Service {
	return &Service{repos: repos, tx: tx, ids: ids}
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
// 部署、チーム、役職が見つからないか別の事業所のものであるときは入力の誤りを返す。
func (s *Service) Create(ctx context.Context, in CreateInput) (Detail, error) {
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
