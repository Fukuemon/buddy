package patient

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
)

// Get は、利用者を返す。
type Get struct {
	patients Repository
	guard    organization.Guard
}

// NewGet は Get を作る。
func NewGet(patients Repository, guard organization.Guard) Get {
	return Get{patients: patients, guard: guard}
}

// Do は、利用者を返す。利用の終了の利用者も返す。
// 利用者が見つからないときは apperr.ErrNotFound を、職員の管理の権限が無いときは apperr.ErrForbidden を返す。
func (p Get) Do(ctx context.Context, id string) (Detail, error) {
	if err := p.guard(ctx); err != nil {
		return Detail{}, err
	}
	return p.patients.Get(ctx, id)
}
