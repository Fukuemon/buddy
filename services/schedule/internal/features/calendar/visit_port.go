package calendar

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/features/servicecode"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/visit"
)

// ServiceCodes は、タイトルのサービス内容で引くサービスコードを読む。
type ServiceCodes interface {
	List(ctx context.Context) ([]servicecode.ServiceCode, error)
}

// VisitStore は、外部の予定のタイトルから決めた訪問の情報を書く。実装は visit.Writer である。
type VisitStore interface {
	Create(ctx context.Context, facilityID string, in visit.Input) (string, error)
	DeleteIfUnused(ctx context.Context, id string) error
}
