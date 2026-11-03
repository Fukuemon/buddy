package patient

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
)

// UpdateInput は、利用者の変更の入力である。値は全て置き換える。
type UpdateInput struct {
	Name            string
	PreferredTime   PreferredTime
	PreferredGender PreferredGender
	ServiceCodeID   string
	AssignedStaffID string
}

// Update は、利用者の名前、希望、サービスコード、担当の職員を in の値にし、変えた利用者を返す。利用の終了の利用者も変えられ、利用の終了は変えない。
// 利用者が見つからないときは apperr.ErrNotFound を、職員の管理の権限が無いときは apperr.ErrForbidden を、
// サービスコードか担当の職員が見つからないか、職員が別の事業所に属するときは入力のエラーを返す。
// 担当を別の職員に変えるときは、休職か退職の職員を入力のエラーで拒む。今の担当のままなら、休職か退職でも拒まない。
// 予定の既に割り振った職員と同じく、担当の職員の休職と退職が、担当を変えない変更を止めないようにする（ADR-0018）。
// 担当は、事業所の共有のロックの後に読み直した利用者と比べる。ロックの前に読んだ担当と比べると、同時の再開が書いた担当を見落とし、退職した職員を確認せずに担当へ戻すためである。
func (p *App) Update(ctx context.Context, id string, in UpdateInput) (Detail, error) {
	if err := p.guard(ctx); err != nil {
		return Detail{}, err
	}
	if _, err := p.deps.ServiceCodes.GetServiceCode(ctx, in.ServiceCodeID); err != nil {
		return Detail{}, apperr.Reference("サービスコード", in.ServiceCodeID, err)
	}
	var updated Detail
	err := p.tx.WithinTx(ctx, func(ctx context.Context) error {
		cur, err := p.deps.Patients.Get(ctx, id)
		if err != nil {
			return err
		}
		if err := p.deps.Staff.LockStatuses(ctx, cur.FacilityID); err != nil {
			return err
		}
		if cur, err = p.deps.Patients.Get(ctx, id); err != nil {
			return err
		}
		if in.AssignedStaffID != cur.AssignedStaffID {
			if err := p.requireAssignable(ctx, in.AssignedStaffID, cur.FacilityID); err != nil {
				return err
			}
		}
		pa, err := New(Patient{
			ID:              cur.ID,
			FacilityID:      cur.FacilityID,
			Name:            in.Name,
			PreferredTime:   in.PreferredTime,
			PreferredGender: in.PreferredGender,
			ServiceCodeID:   in.ServiceCodeID,
			AssignedStaffID: in.AssignedStaffID,
			EndedAt:         cur.EndedAt,
		})
		if err != nil {
			return err
		}
		if err := p.deps.Patients.Update(ctx, pa); err != nil {
			return err
		}
		updated, err = p.deps.Patients.Get(ctx, pa.ID)
		return err
	})
	return updated, err
}
