package httpapi

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/features/visit"
)

// VisitCategoryApp は、訪問の区分のハンドラが使う操作である。
// 組み立ての場所が、visit の操作の型の Do を入れる。入れていない操作を呼ぶと panic する（ADR-0024）。
type VisitCategoryApp struct {
	List func(ctx context.Context) ([]visit.Category, error)
}
