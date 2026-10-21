package patient

import (
	"context"

	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/organization"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/staff"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/visit"
)

// Repositories は、Service が使うリポジトリである。
type Repositories struct {
	Facilities organization.FacilityRepository
	Staff      staff.Repository
	Visits     visit.Repository
	Patients   Repository
}

// Service は、利用者の操作である。
type Service struct {
	repos Repositories
	ids   domain.IDGenerator
}

// NewService は Service を作る。
func NewService(repos Repositories, ids domain.IDGenerator) *Service {
	return &Service{repos: repos, ids: ids}
}

// CreateInput は、利用者の作成の入力である。
type CreateInput struct {
	FacilityID      string
	Name            string
	PreferredTime   PreferredTime
	PreferredGender PreferredGender
	ServiceCodeID   string
	AssignedStaffID string
}

// Create は、利用者を作る。事業所が見つからないときは domain.ErrNotFound を、
// サービスコードか担当の職員が見つからないか、職員が別の事業所に属するときは入力の誤りを返す。
func (p *Service) Create(ctx context.Context, in CreateInput) (Detail, error) {
	if _, err := p.repos.Facilities.Get(ctx, in.FacilityID); err != nil {
		return Detail{}, err
	}
	if _, err := p.repos.Visits.GetServiceCode(ctx, in.ServiceCodeID); err != nil {
		return Detail{}, domain.Reference("サービスコード", in.ServiceCodeID, err)
	}
	st, err := p.repos.Staff.Get(ctx, in.AssignedStaffID)
	if err != nil {
		return Detail{}, domain.Reference("職員", in.AssignedStaffID, err)
	}
	if err := domain.SameFacility("職員", st.ID, st.FacilityID, in.FacilityID); err != nil {
		return Detail{}, err
	}
	pa, err := New(Patient{
		ID:              p.ids.NewID(),
		FacilityID:      in.FacilityID,
		Name:            in.Name,
		PreferredTime:   in.PreferredTime,
		PreferredGender: in.PreferredGender,
		ServiceCodeID:   in.ServiceCodeID,
		AssignedStaffID: st.ID,
	})
	if err != nil {
		return Detail{}, err
	}
	if err := p.repos.Patients.Create(ctx, pa); err != nil {
		return Detail{}, err
	}
	return p.repos.Patients.Get(ctx, pa.ID)
}

// List は、事業所の利用者を返す。事業所が見つからないときは domain.ErrNotFound を返す。
func (p *Service) List(ctx context.Context, facilityID string, q ListQuery) ([]Detail, error) {
	if _, err := p.repos.Facilities.Get(ctx, facilityID); err != nil {
		return nil, err
	}
	return p.repos.Patients.ListByFacility(ctx, facilityID, q)
}
