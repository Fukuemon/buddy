package calendarwrite

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/features/visit"
)

// VisitInfos は、予定の訪問の情報を書く。実装は visit.Writer である。
type VisitInfos interface {
	Create(ctx context.Context, facilityID string, in visit.Input) (string, error)
	// DeleteIfUnused は、予定、繰り返しの予定、記録のどれも指していない訪問の情報 id を消す。指されているか、無いときは何もしない。
	DeleteIfUnused(ctx context.Context, id string) error
}

// VisitDetails は、訪問の情報を名前を付けて読む。実装は postgres.VisitInfoRepository である。
type VisitDetails interface {
	// GetDetail は、訪問の情報 id を、利用者、職員、サービスコード、区分の名前を付けて返す。無いときは apperr.ErrNotFound を返す。
	GetDetail(ctx context.Context, id string) (visit.Detail, error)
}
