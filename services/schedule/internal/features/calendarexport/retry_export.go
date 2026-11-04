package calendarexport

import (
	"context"
	"errors"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendar"
	"github.com/Fukuemon/buddy/services/schedule/internal/kernel"
)

// RetryExport は、確認が必要な書き出し id を、外部の予定の変更を比べずに buddy の内容で書き直す待ちにして、待ちを返す。
type RetryExport struct {
	exports ExportRepository
	guard   kernel.Guard
}

// NewRetryExport は RetryExport を作る。
func NewRetryExport(exports ExportRepository, guard kernel.Guard) RetryExport {
	return RetryExport{exports: exports, guard: guard}
}

// Do は、確認が必要な書き出し id を、外部の予定の変更を比べずに buddy の内容で書き直す待ちにして、待ちを返す。
// 待ちが見つからないときは apperr.ErrNotFound を、確認が必要な待ちでないときは apperr.ErrConflict を返す。
func (u RetryExport) Do(ctx context.Context, id string) (calendar.Export, error) {
	if err := u.guard(ctx); err != nil {
		return calendar.Export{}, err
	}
	if _, err := u.exports.Get(ctx, id); err != nil {
		return calendar.Export{}, err
	}
	if err := u.exports.Retry(ctx, id); err != nil {
		if errors.Is(err, apperr.ErrConflict) {
			return calendar.Export{}, calendar.ErrExportNotInReview
		}
		return calendar.Export{}, err
	}
	return u.exports.Get(ctx, id)
}
