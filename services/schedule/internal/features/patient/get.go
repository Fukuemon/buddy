package patient

import (
	"context"
)

// Get は、利用者を返す。利用の終了の利用者も返す。
// 利用者が見つからないときは apperr.ErrNotFound を、職員の管理の権限が無いときは apperr.ErrForbidden を返す。
func (p *App) Get(ctx context.Context, id string) (Detail, error) {
	if err := p.guard(ctx); err != nil {
		return Detail{}, err
	}
	return p.deps.Patients.Get(ctx, id)
}
