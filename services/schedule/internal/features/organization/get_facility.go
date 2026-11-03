package organization

import (
	"context"
)

// GetFacility は、事業所 id を返す。見つからないときは apperr.ErrNotFound を返す。
func (o *App) GetFacility(ctx context.Context, id string) (Facility, error) {
	return o.deps.Facilities.Get(ctx, id)
}
