package organization

import (
	"context"
)

// GetPosition は、役職 id を、デフォルトの権限とともに返す。
type GetPosition struct {
	positions PositionRepository
}

// NewGetPosition は GetPosition を作る。
func NewGetPosition(positions PositionRepository) GetPosition {
	return GetPosition{positions: positions}
}

// Do は、役職 id を、デフォルトの権限とともに返す。見つからないときは apperr.ErrNotFound を返す。
func (o GetPosition) Do(ctx context.Context, id string) (Position, error) {
	return o.positions.Get(ctx, id)
}
