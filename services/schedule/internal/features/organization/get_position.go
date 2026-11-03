package organization

import (
	"context"
)

// GetPosition は、役職 id を、デフォルトの権限とともに返す。見つからないときは apperr.ErrNotFound を返す。
func (o *Usecase) GetPosition(ctx context.Context, id string) (Position, error) {
	return o.deps.Positions.Get(ctx, id)
}
