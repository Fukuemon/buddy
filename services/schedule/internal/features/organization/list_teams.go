package organization

import (
	"context"
)

// ListTeams は、事業所 facilityID の全てのチームを返す。事業所が見つからないときは apperr.ErrNotFound を返す。
func (o *Usecase) ListTeams(ctx context.Context, facilityID string) ([]Team, error) {
	if _, err := o.deps.Facilities.Get(ctx, facilityID); err != nil {
		return nil, err
	}
	return o.deps.Teams.ListByFacility(ctx, facilityID)
}
