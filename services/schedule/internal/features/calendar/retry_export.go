package calendar

import (
	"context"
	"errors"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
)

// RetryExport は、確認が必要な書き出し id を、外部の予定の変更を比べずに buddy の内容で書き直す待ちにして、待ちを返す。
// 待ちが見つからないときは apperr.ErrNotFound を、確認が必要な待ちでないときは apperr.ErrConflict を返す。
func (u *Usecase) RetryExport(ctx context.Context, id string) (Export, error) {
	if err := u.guard(ctx); err != nil {
		return Export{}, err
	}
	if _, err := u.deps.Exports.Get(ctx, id); err != nil {
		return Export{}, err
	}
	if err := u.deps.Exports.Retry(ctx, id); err != nil {
		if errors.Is(err, apperr.ErrConflict) {
			return Export{}, errNotInReview
		}
		return Export{}, err
	}
	return u.deps.Exports.Get(ctx, id)
}
