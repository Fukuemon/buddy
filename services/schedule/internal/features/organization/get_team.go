package organization

import (
	"context"
)

// GetTeam は、チーム id を返す。
type GetTeam struct {
	teams TeamRepository
}

// NewGetTeam は GetTeam を作る。
func NewGetTeam(teams TeamRepository) GetTeam {
	return GetTeam{teams: teams}
}

// Do は、チーム id を返す。見つからないときは apperr.ErrNotFound を返す。
func (o GetTeam) Do(ctx context.Context, id string) (Team, error) {
	return o.teams.Get(ctx, id)
}
