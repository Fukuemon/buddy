package calendar

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/kernel"
)

// ServiceAccount は、事業所 facilityID の職員がカレンダーを共有する相手のメールアドレスを返す。
type ServiceAccount struct {
	accounts Accounts
	guard    kernel.Guard
}

// NewServiceAccount は ServiceAccount を作る。
func NewServiceAccount(accounts Accounts, guard kernel.Guard) ServiceAccount {
	return ServiceAccount{accounts: accounts, guard: guard}
}

// Do は、事業所 facilityID の職員がカレンダーを共有する相手のメールアドレスを返す。設定が無ければ ErrNotConfigured を返す。
func (u ServiceAccount) Do(ctx context.Context, facilityID string) (string, error) {
	if err := u.guard(ctx); err != nil {
		return "", err
	}
	if u.accounts == nil {
		return "", ErrNotConfigured
	}
	return u.accounts.ServiceAccount(ctx, facilityID)
}
