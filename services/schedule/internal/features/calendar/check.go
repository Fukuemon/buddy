package calendar

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
)

// Check は、事業所 facilityID のサービスアカウントで calendarID のカレンダーを読めるかを確認する。
type Check struct {
	accounts Accounts
	guard    organization.Guard
}

// NewCheck は Check を作る。
func NewCheck(accounts Accounts, guard organization.Guard) Check {
	return Check{accounts: accounts, guard: guard}
}

// Do は、事業所 facilityID のサービスアカウントで calendarID のカレンダーを読めるかを確認する。
// 読めないときは ErrUnreadable か ErrUnavailable を包んだエラーを返す。
func (u Check) Do(ctx context.Context, facilityID, calendarID string) error {
	if err := u.guard(ctx); err != nil {
		return err
	}
	src, calendarID, err := requireSource(ctx, u.accounts, facilityID, calendarID)
	if err != nil {
		return err
	}
	return src.Check(ctx, calendarID)
}
