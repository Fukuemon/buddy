package patient

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/kernel"
	"github.com/Fukuemon/buddy/services/schedule/internal/tx"
)

// Resume は、利用者を利用中に戻し（利用の再開）、担当の職員を assignedStaffID にして、戻した利用者を返す。
type Resume struct {
	patients Repository
	locks    FacilityLock
	staff    StaffRefs
	tx       tx.Transactor
	guard    kernel.Guard
}

// NewResume は Resume を作る。
func NewResume(patients Repository, locks FacilityLock, staff StaffRefs, tx tx.Transactor, guard kernel.Guard) Resume {
	return Resume{patients: patients, locks: locks, staff: staff, tx: tx, guard: guard}
}

// Do は、利用者を利用中に戻し（利用の再開）、担当の職員を assignedStaffID にして、戻した利用者を返す。利用中の利用者を戻しても成功し、担当を書き換える。
// 利用者が見つからないときは apperr.ErrNotFound を、職員の管理の権限が無いときは apperr.ErrForbidden を、
// 職員が見つからないか、別の事業所の職員か、休職か退職の職員のときは入力のエラーを返す（ADR-0001）。
// 利用の終了の間に担当の職員が退職することがあるので、再開では担当を必ず決め直す。
func (p Resume) Do(ctx context.Context, id, assignedStaffID string) (Detail, error) {
	if err := p.guard(ctx); err != nil {
		return Detail{}, err
	}
	var resumed Detail
	err := p.tx.WithinTx(ctx, func(ctx context.Context) error {
		cur, err := locked(ctx, p.patients, p.locks, id)
		if err != nil {
			return err
		}
		if err := requireAssignable(ctx, p.staff, assignedStaffID, cur.FacilityID); err != nil {
			return err
		}
		if err := p.patients.Resume(ctx, cur.ID, assignedStaffID); err != nil {
			return err
		}
		resumed, err = p.patients.Get(ctx, cur.ID)
		return err
	})
	return resumed, err
}
