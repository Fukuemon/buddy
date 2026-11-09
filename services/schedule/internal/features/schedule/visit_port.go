package schedule

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/features/visit"
)

// VisitInfos は、訪問の予定に付く訪問の情報を書く。実装は visit.Writer である。
type VisitInfos interface {
	Create(ctx context.Context, facilityID string, in visit.Input) (string, error)
	DeleteIfUnused(ctx context.Context, id string) error
}

// VisitCopier は、保存した訪問の情報を、同じ内容の新しい訪問の情報に写す。実装は visit.Writer である。
type VisitCopier interface {
	Copy(ctx context.Context, info visit.Info) (string, error)
}
