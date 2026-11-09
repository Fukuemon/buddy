package scheduleview

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/features/servicecode"
)

// ServiceCodes は、Projection の予定のタイトルのサービス内容で引くサービスコードを読む。
type ServiceCodes interface {
	List(ctx context.Context) ([]servicecode.ServiceCode, error)
}
