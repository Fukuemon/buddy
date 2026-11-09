package calendarexport

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendar"
	"github.com/Fukuemon/buddy/services/schedule/internal/kernel"
)

// ListExportIssues は、事業所の確認が必要な書き出し（外部のカレンダーで変わっていたか、書けなかった予定）を返す。
type ListExportIssues struct {
	exports ExportRepository
	guard   kernel.Guard
}

// NewListExportIssues は ListExportIssues を作る。
func NewListExportIssues(exports ExportRepository, guard kernel.Guard) ListExportIssues {
	return ListExportIssues{exports: exports, guard: guard}
}

// Do は、事業所の確認が必要な書き出し（外部のカレンダーで変わっていたか、書けなかった予定）を返す。
func (u ListExportIssues) Do(ctx context.Context, facilityID string) ([]calendar.ExportIssue, error) {
	if err := u.guard(ctx); err != nil {
		return nil, err
	}
	return u.exports.ListIssues(ctx, facilityID)
}
