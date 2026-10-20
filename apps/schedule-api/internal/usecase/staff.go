package usecase

import (
	"context"

	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain/organization"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain/staff"
)

// StaffRepositories は、Staff が使うリポジトリである。
type StaffRepositories struct {
	Facilities  organization.FacilityRepository
	Departments organization.DepartmentRepository
	Teams       organization.TeamRepository
	Positions   organization.PositionRepository
	Staff       staff.Repository
}

// Staff は、職員の操作である。
type Staff struct {
	repos StaffRepositories
	tx    domain.Transactor
	ids   domain.IDGenerator
}

// NewStaff は Staff を作る。
func NewStaff(repos StaffRepositories, tx domain.Transactor, ids domain.IDGenerator) *Staff {
	return &Staff{repos: repos, tx: tx, ids: ids}
}

// CreateStaffInput は、職員の作成の入力である。
type CreateStaffInput struct {
	FacilityID   string
	Username     string
	Email        string
	PhoneNumber  *string
	DepartmentID string
	TeamID       string
	PositionID   string
}

// Create は、職員を作り、役職の既定の権限を与える。事業所が見つからないときは domain.ErrNotFound を、
// 部署、チーム、役職が見つからないか別の事業所のものであるときは入力の誤りを返す。
func (s *Staff) Create(ctx context.Context, in CreateStaffInput) (staff.Detail, error) {
	if _, err := s.repos.Facilities.Get(ctx, in.FacilityID); err != nil {
		return staff.Detail{}, err
	}
	dep, err := s.repos.Departments.Get(ctx, in.DepartmentID)
	if err != nil {
		return staff.Detail{}, reference("部署", in.DepartmentID, err)
	}
	if err := sameFacility("部署", dep.ID, dep.FacilityID, in.FacilityID); err != nil {
		return staff.Detail{}, err
	}
	team, err := s.repos.Teams.Get(ctx, in.TeamID)
	if err != nil {
		return staff.Detail{}, reference("チーム", in.TeamID, err)
	}
	if err := sameFacility("チーム", team.ID, team.FacilityID, in.FacilityID); err != nil {
		return staff.Detail{}, err
	}
	pos, err := s.repos.Positions.Get(ctx, in.PositionID)
	if err != nil {
		return staff.Detail{}, reference("役職", in.PositionID, err)
	}
	if err := sameFacility("役職", pos.ID, pos.FacilityID, in.FacilityID); err != nil {
		return staff.Detail{}, err
	}
	st, err := staff.New(staff.NewParams{
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
		return staff.Detail{}, err
	}
	grants := make([]staff.Grant, 0, len(pos.Policies))
	for _, p := range pos.Policies {
		grants = append(grants, staff.Grant{ID: s.ids.NewID(), PolicyID: p.ID})
	}
	var created staff.Detail
	err = s.tx.WithinTx(ctx, func(ctx context.Context) error {
		if err := s.repos.Staff.Create(ctx, st, grants); err != nil {
			return err
		}
		created, err = s.repos.Staff.Get(ctx, st.ID)
		return err
	})
	return created, err
}

// Get は、職員と権限を返す。
func (s *Staff) Get(ctx context.Context, id string) (staff.Detail, error) {
	return s.repos.Staff.Get(ctx, id)
}

// List は、事業所の職員を返す。事業所が見つからないときは domain.ErrNotFound を返す。
func (s *Staff) List(ctx context.Context, facilityID string, q staff.ListQuery) ([]staff.Summary, error) {
	if _, err := s.repos.Facilities.Get(ctx, facilityID); err != nil {
		return nil, err
	}
	return s.repos.Staff.ListByFacility(ctx, facilityID, q)
}
