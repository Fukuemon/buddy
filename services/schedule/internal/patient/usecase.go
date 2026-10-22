package patient

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/kernel"
	"github.com/Fukuemon/buddy/services/schedule/internal/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/staff"
	"github.com/Fukuemon/buddy/services/schedule/internal/visit"
)

// ServiceCodes は、利用者のデフォルトのサービスコードを確かめる。見つからないときは apperr.ErrNotFound を返す。
type ServiceCodes interface {
	GetServiceCode(ctx context.Context, id string) (visit.ServiceCode, error)
}

// Deps は、Usecase が使うリポジトリと、ほかの機能のデータを読む小さなインターフェイスである。
type Deps struct {
	Facilities   kernel.Finder[organization.Facility]
	Staff        kernel.Finder[staff.Ref]
	ServiceCodes ServiceCodes
	Patients     Repository
}

// Usecase は、利用者の操作である。利用者の登録は、guard が許すときだけ行う（ADR-0006）。
type Usecase struct {
	deps  Deps
	ids   kernel.IDGenerator
	guard organization.Guard
}

// NewUsecase は Usecase を作る。
func NewUsecase(deps Deps, ids kernel.IDGenerator, guard organization.Guard) *Usecase {
	return &Usecase{deps: deps, ids: ids, guard: guard}
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

// Create は、利用者を作る。事業所が見つからないときは apperr.ErrNotFound を、
// サービスコードか担当の職員が見つからないか、職員が別の事業所に属するときは入力のエラーを返す。
// 職員の管理の権限が無いときは apperr.ErrForbidden を返す。
func (p *Usecase) Create(ctx context.Context, in CreateInput) (Detail, error) {
	if err := p.guard(ctx); err != nil {
		return Detail{}, err
	}
	if _, err := p.deps.Facilities.Get(ctx, in.FacilityID); err != nil {
		return Detail{}, err
	}
	if _, err := p.deps.ServiceCodes.GetServiceCode(ctx, in.ServiceCodeID); err != nil {
		return Detail{}, apperr.Reference("サービスコード", in.ServiceCodeID, err)
	}
	st, err := p.deps.Staff.Get(ctx, in.AssignedStaffID)
	if err != nil {
		return Detail{}, apperr.Reference("職員", in.AssignedStaffID, err)
	}
	if err := apperr.SameFacility("職員", st.ID, st.FacilityID, in.FacilityID); err != nil {
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
	if err := p.deps.Patients.Create(ctx, pa); err != nil {
		return Detail{}, err
	}
	return p.deps.Patients.Get(ctx, pa.ID)
}

// List は、事業所の利用者を返す。事業所が見つからないときは apperr.ErrNotFound を返す。
func (p *Usecase) List(ctx context.Context, facilityID string, q ListQuery) ([]Detail, error) {
	if _, err := p.deps.Facilities.Get(ctx, facilityID); err != nil {
		return nil, err
	}
	return p.deps.Patients.ListByFacility(ctx, facilityID, q)
}
