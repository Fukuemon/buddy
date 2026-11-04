package visit

import (
	"context"
)

// ListServiceCodes は、すべてのサービスコードを返す。
type ListServiceCodes struct {
	masters MasterRepository
}

// NewListServiceCodes は ListServiceCodes を作る。
func NewListServiceCodes(masters MasterRepository) ListServiceCodes {
	return ListServiceCodes{masters: masters}
}

// Do は、すべてのサービスコードを返す。
func (o ListServiceCodes) Do(ctx context.Context) ([]ServiceCode, error) {
	return o.masters.ListServiceCodes(ctx)
}
