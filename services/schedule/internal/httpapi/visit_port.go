package httpapi

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/features/visit"
)

// VisitMasterApp は、訪問の情報のマスタのハンドラが使う操作である。
// 組み立ての場所が、visit の操作の型の Do を入れる。入れていない操作を呼ぶと panic する（ADR-0031）。
type VisitMasterApp struct {
	ListServiceCodes func(ctx context.Context) ([]visit.ServiceCode, error)
	ListCategories   func(ctx context.Context) ([]visit.Category, error)
}
