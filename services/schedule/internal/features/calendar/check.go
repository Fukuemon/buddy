package calendar

import "context"

// Check は、事業所 facilityID のサービスアカウントで calendarID のカレンダーを読めるかを確認する。
// 読めないときは ErrUnreadable か ErrUnavailable を包んだエラーを返す。
func (u *Usecase) Check(ctx context.Context, facilityID, calendarID string) error {
	if err := u.guard(ctx); err != nil {
		return err
	}
	src, calendarID, err := u.requireSource(ctx, facilityID, calendarID)
	if err != nil {
		return err
	}
	return src.Check(ctx, calendarID)
}
