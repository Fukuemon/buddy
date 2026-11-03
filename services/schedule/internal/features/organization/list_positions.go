package organization

import (
	"context"
)

// ListPositions は、事業所 facilityID の全ての役職を、デフォルトの権限とともに返す。
// 事業所が見つからないときは apperr.ErrNotFound を返す。
func (o *App) ListPositions(ctx context.Context, facilityID string) ([]Position, error) {
	if _, err := o.deps.Facilities.Get(ctx, facilityID); err != nil {
		return nil, err
	}
	return o.deps.Positions.ListByFacility(ctx, facilityID)
}
