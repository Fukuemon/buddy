package patient

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/kernel"
	"github.com/Fukuemon/buddy/services/schedule/internal/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/staff"
	"github.com/Fukuemon/buddy/services/schedule/internal/tx"
	"github.com/Fukuemon/buddy/services/schedule/internal/visit"
)

// ServiceCodes は、利用者のデフォルトのサービスコードを確認する。見つからないときは apperr.ErrNotFound を返す。
type ServiceCodes interface {
	GetServiceCode(ctx context.Context, id string) (visit.ServiceCode, error)
}

// StaffRefs は、利用者の担当の職員を参照する。Get は、職員が見つからないときに apperr.ErrNotFound を返す。
// LockStatuses は、トランザクションが終わるまで、事業所 facilityID の職員を休職、復職、退職にさせない。
type StaffRefs interface {
	Get(ctx context.Context, id string) (staff.Ref, error)
	LockStatuses(ctx context.Context, facilityID string) error
}

// Deps は、Usecase が使うリポジトリと、ほかの機能のデータを読む小さなインターフェイスである。
type Deps struct {
	Facilities   kernel.Finder[organization.Facility]
	Staff        StaffRefs
	ServiceCodes ServiceCodes
	Patients     Repository
}

// Usecase は、利用者の操作である。利用者の登録は、guard が許すときだけ行う（ADR-0006）。
type Usecase struct {
	deps  Deps
	tx    tx.Transactor
	ids   kernel.IDGenerator
	guard organization.Guard
}

// NewUsecase は Usecase を作る。
func NewUsecase(deps Deps, tx tx.Transactor, ids kernel.IDGenerator, guard organization.Guard) *Usecase {
	return &Usecase{deps: deps, tx: tx, ids: ids, guard: guard}
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
// 担当の職員が休職か退職のときも入力のエラーを返す（ADR-0018）。職員の管理の権限が無いときは apperr.ErrForbidden を返す。
// 予定の作成と同じく、担当の職員の状態を確認する前に、事業所の職員の休職と退職をトランザクションの終わりまで待たせる。
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
	var created Detail
	err := p.tx.WithinTx(ctx, func(ctx context.Context) error {
		if err := p.deps.Staff.LockStatuses(ctx, in.FacilityID); err != nil {
			return err
		}
		st, err := p.deps.Staff.Get(ctx, in.AssignedStaffID)
		if err != nil {
			return apperr.Reference("職員", in.AssignedStaffID, err)
		}
		if err := apperr.SameFacility("職員", st.ID, st.FacilityID, in.FacilityID); err != nil {
			return err
		}
		if err := st.Assignable(); err != nil {
			return err
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
			return err
		}
		if err := p.deps.Patients.Create(ctx, pa); err != nil {
			return err
		}
		created, err = p.deps.Patients.Get(ctx, pa.ID)
		return err
	})
	return created, err
}

// List は、事業所の利用者を返す。事業所が見つからないときは apperr.ErrNotFound を返す。
func (p *Usecase) List(ctx context.Context, facilityID string, q ListQuery) ([]Detail, error) {
	if _, err := p.deps.Facilities.Get(ctx, facilityID); err != nil {
		return nil, err
	}
	return p.deps.Patients.ListByFacility(ctx, facilityID, q)
}
