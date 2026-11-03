package calendar

import "context"

// ServiceAccount は、事業所 facilityID の職員がカレンダーを共有する相手のメールアドレスを返す。設定が無ければ ErrNotConfigured を返す。
func (u *Usecase) ServiceAccount(ctx context.Context, facilityID string) (string, error) {
	if err := u.guard(ctx); err != nil {
		return "", err
	}
	if u.deps.Accounts == nil {
		return "", ErrNotConfigured
	}
	return u.deps.Accounts.ServiceAccount(ctx, facilityID)
}
