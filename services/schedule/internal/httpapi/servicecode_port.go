package httpapi

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/features/servicecode"
)

// ServiceCodeApp は、サービスコードのハンドラが使う操作である。
// 組み立ての場所が、servicecode の操作の型の Do を入れる。入れていない操作を呼ぶと panic する（ADR-0005）。
type ServiceCodeApp struct {
	List func(ctx context.Context) ([]servicecode.ServiceCode, error)
}
