package patient

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/kernel"
	"github.com/Fukuemon/buddy/services/schedule/internal/tx"
)

// CreateInput は、利用者の作成の入力である。
type CreateInput struct {
	FacilityID      string
	Name            string
	PreferredTime   PreferredTime
	PreferredGender PreferredGender
	ServiceCodeID   string
	AssignedStaffID string
}

// Create は、利用者を作る。
type Create struct {
	facilities   kernel.Finder[organization.Facility]
	serviceCodes ServiceCodes
	staff        StaffRefs
	locks        FacilityLock
	patients     Repository
	tx           tx.Transactor
	ids          kernel.IDGenerator
	guard        kernel.Guard
}

// NewCreate は Create を作る。
func NewCreate(facilities kernel.Finder[organization.Facility], serviceCodes ServiceCodes, staff StaffRefs, locks FacilityLock, patients Repository, tx tx.Transactor, ids kernel.IDGenerator, guard kernel.Guard) Create {
	return Create{facilities: facilities, serviceCodes: serviceCodes, staff: staff, locks: locks, patients: patients, tx: tx, ids: ids, guard: guard}
}

// Do は、利用者を作る。事業所が見つからないときは apperr.ErrNotFound を、
// サービスコードか担当の職員が見つからないか、職員が別の事業所に属するときは入力のエラーを返す。
// 担当の職員が休職か退職のときも入力のエラーを返す（ADR-0016）。職員の管理の権限が無いときは apperr.ErrForbidden を返す。
// 予定の作成と同じく、担当の職員の状態を確認する前に、事業所の職員の休職と退職をトランザクションの終わりまで待たせる。
func (p Create) Do(ctx context.Context, in CreateInput) (Detail, error) {
	if err := p.guard(ctx); err != nil {
		return Detail{}, err
	}
	if _, err := p.facilities.Get(ctx, in.FacilityID); err != nil {
		return Detail{}, err
	}
	if _, err := p.serviceCodes.Get(ctx, in.ServiceCodeID); err != nil {
		return Detail{}, apperr.Reference("サービスコード", in.ServiceCodeID, err)
	}
	var created Detail
	err := p.tx.WithinTx(ctx, func(ctx context.Context) error {
		if err := p.locks.Share(ctx, in.FacilityID); err != nil {
			return err
		}
		if err := requireAssignable(ctx, p.staff, in.AssignedStaffID, in.FacilityID); err != nil {
			return err
		}
		pa, err := New(Patient{
			ID:              p.ids.NewID(),
			FacilityID:      in.FacilityID,
			Name:            in.Name,
			PreferredTime:   in.PreferredTime,
			PreferredGender: in.PreferredGender,
			ServiceCodeID:   in.ServiceCodeID,
			AssignedStaffID: in.AssignedStaffID,
		})
		if err != nil {
			return err
		}
		if err := p.patients.Create(ctx, pa); err != nil {
			return err
		}
		created, err = p.patients.Get(ctx, pa.ID)
		return err
	})
	return created, err
}
