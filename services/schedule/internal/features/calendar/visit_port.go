package calendar

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/features/visit"
)

// VisitStore は、外部の予定のタイトルから決めた訪問の情報を書く。実装は visit.Writer である。
type VisitStore interface {
	Create(ctx context.Context, facilityID string, in visit.Input) (string, error)
	DeleteIfUnused(ctx context.Context, id string) error
}
