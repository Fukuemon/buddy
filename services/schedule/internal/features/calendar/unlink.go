package calendar

import "context"

// Unlink は、カレンダーを外す。取り込んだ予定と外部の予定の対応は残す。カレンダーが無いか外したときは apperr.ErrNotFound を返す。
func (u *Usecase) Unlink(ctx context.Context, id string) error {
	if err := u.guard(ctx); err != nil {
		return err
	}
	if _, err := u.active(ctx, id); err != nil {
		return err
	}
	return u.deps.Calendars.Disable(ctx, id)
}
