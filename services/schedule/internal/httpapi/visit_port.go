package httpapi

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/features/visit"
)

// VisitMasterApp は、訪問の情報のマスタのハンドラが使う操作である。
type VisitMasterApp interface {
	ListServiceCodes(ctx context.Context) ([]visit.ServiceCode, error)
	ListCategories(ctx context.Context) ([]visit.Category, error)
}
