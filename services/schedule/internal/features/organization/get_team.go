package organization

import (
	"context"
)

// GetTeam は、チーム id を返す。見つからないときは apperr.ErrNotFound を返す。
func (o *App) GetTeam(ctx context.Context, id string) (Team, error) {
	return o.deps.Teams.Get(ctx, id)
}
