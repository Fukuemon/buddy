package calendar

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
)

// Unlink は、カレンダーを外す。
type Unlink struct {
	calendars Repository
	guard     organization.Guard
}

// NewUnlink は Unlink を作る。
func NewUnlink(calendars Repository, guard organization.Guard) Unlink {
	return Unlink{calendars: calendars, guard: guard}
}

// Do は、カレンダーを外す。取り込んだ予定と外部の予定の対応は残す。カレンダーが無いか外したときは apperr.ErrNotFound を返す。
func (u Unlink) Do(ctx context.Context, id string) error {
	if err := u.guard(ctx); err != nil {
		return err
	}
	if _, err := Active(ctx, u.calendars, id); err != nil {
		return err
	}
	return u.calendars.Disable(ctx, id)
}
