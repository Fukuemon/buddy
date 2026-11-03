package patient

import (
	"context"
)

// Resume は、利用者を利用中に戻し（利用の再開）、担当の職員を assignedStaffID にして、戻した利用者を返す。利用中の利用者を戻しても成功し、担当を書き換える。
// 利用者が見つからないときは apperr.ErrNotFound を、職員の管理の権限が無いときは apperr.ErrForbidden を、
// 職員が見つからないか、別の事業所の職員か、休職か退職の職員のときは入力のエラーを返す（ADR-0021）。
// 利用の終了の間に担当の職員が退職することがあるので、再開では担当を必ず決め直す。
func (p *Usecase) Resume(ctx context.Context, id, assignedStaffID string) (Detail, error) {
	if err := p.guard(ctx); err != nil {
		return Detail{}, err
	}
	var resumed Detail
	err := p.tx.WithinTx(ctx, func(ctx context.Context) error {
		cur, err := p.locked(ctx, id)
		if err != nil {
			return err
		}
		if err := p.requireAssignable(ctx, assignedStaffID, cur.FacilityID); err != nil {
			return err
		}
		if err := p.deps.Patients.Resume(ctx, cur.ID, assignedStaffID); err != nil {
			return err
		}
		resumed, err = p.deps.Patients.Get(ctx, cur.ID)
		return err
	})
	return resumed, err
}
