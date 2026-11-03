package visit

import (
	"context"
)

// ListServiceCodes は、すべてのサービスコードを返す。
func (v *App) ListServiceCodes(ctx context.Context) ([]ServiceCode, error) {
	return v.masters.ListServiceCodes(ctx)
}
