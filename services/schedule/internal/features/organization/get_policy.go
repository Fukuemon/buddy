package organization

import (
	"context"
)

// GetPolicy は、権限 id を返す。見つからないときは apperr.ErrNotFound を返す。
func (o *App) GetPolicy(ctx context.Context, id string) (Policy, error) {
	return o.deps.Policies.Get(ctx, id)
}
