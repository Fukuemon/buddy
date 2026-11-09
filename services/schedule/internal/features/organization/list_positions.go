package organization

import (
	"context"
)

// ListPositions は、事業所 facilityID の全ての役職を、デフォルトの権限とともに返す。
type ListPositions struct {
	facilities FacilityRepository
	positions  PositionRepository
}

// NewListPositions は ListPositions を作る。
func NewListPositions(facilities FacilityRepository, positions PositionRepository) ListPositions {
	return ListPositions{facilities: facilities, positions: positions}
}

// Do は、事業所 facilityID の全ての役職を、デフォルトの権限とともに返す。
// 事業所が見つからないときは apperr.ErrNotFound を返す。
func (o ListPositions) Do(ctx context.Context, facilityID string) ([]Position, error) {
	if _, err := o.facilities.Get(ctx, facilityID); err != nil {
		return nil, err
	}
	return o.positions.ListByFacility(ctx, facilityID)
}
