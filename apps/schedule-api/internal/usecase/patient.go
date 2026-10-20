package usecase

import (
	"context"

	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain/organization"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain/patient"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain/staff"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain/visit"
)

// PatientRepositories は、Patients が使うリポジトリである。
type PatientRepositories struct {
	Facilities organization.FacilityRepository
	Staff      staff.Repository
	Visits     visit.Repository
	Patients   patient.Repository
}

// Patients は、利用者の操作である。
type Patients struct {
	repos PatientRepositories
	ids   domain.IDGenerator
}

// NewPatients は Patients を作る。
func NewPatients(repos PatientRepositories, ids domain.IDGenerator) *Patients {
	return &Patients{repos: repos, ids: ids}
}

// CreatePatientInput は、利用者の作成の入力である。
type CreatePatientInput struct {
	FacilityID      string
	Name            string
	PreferredTime   patient.PreferredTime
	PreferredGender patient.PreferredGender
	ServiceCodeID   string
	AssignedStaffID string
}

// Create は、利用者を作る。事業所が見つからないときは domain.ErrNotFound を、
// サービスコードか担当の職員が見つからないか、職員が別の事業所に属するときは入力の誤りを返す。
func (p *Patients) Create(ctx context.Context, in CreatePatientInput) (patient.Detail, error) {
	if _, err := p.repos.Facilities.Get(ctx, in.FacilityID); err != nil {
		return patient.Detail{}, err
	}
	if _, err := p.repos.Visits.GetServiceCode(ctx, in.ServiceCodeID); err != nil {
		return patient.Detail{}, reference("サービスコード", in.ServiceCodeID, err)
	}
	st, err := p.repos.Staff.Get(ctx, in.AssignedStaffID)
	if err != nil {
		return patient.Detail{}, reference("職員", in.AssignedStaffID, err)
	}
	if err := sameFacility("職員", st.ID, st.FacilityID, in.FacilityID); err != nil {
		return patient.Detail{}, err
	}
	pa, err := patient.New(patient.Patient{
		ID:              p.ids.NewID(),
		FacilityID:      in.FacilityID,
		Name:            in.Name,
		PreferredTime:   in.PreferredTime,
		PreferredGender: in.PreferredGender,
		ServiceCodeID:   in.ServiceCodeID,
		AssignedStaffID: st.ID,
	})
	if err != nil {
		return patient.Detail{}, err
	}
	if err := p.repos.Patients.Create(ctx, pa); err != nil {
		return patient.Detail{}, err
	}
	return p.repos.Patients.Get(ctx, pa.ID)
}

// List は、事業所の利用者を返す。事業所が見つからないときは domain.ErrNotFound を返す。
func (p *Patients) List(ctx context.Context, facilityID string, q patient.ListQuery) ([]patient.Detail, error) {
	if _, err := p.repos.Facilities.Get(ctx, facilityID); err != nil {
		return nil, err
	}
	return p.repos.Patients.ListByFacility(ctx, facilityID, q)
}
