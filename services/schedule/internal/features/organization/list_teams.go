package organization

import (
	"context"
)

// ListTeams は、事業所 facilityID の全てのチームを返す。
type ListTeams struct {
	facilities FacilityRepository
	teams      TeamRepository
}

// NewListTeams は ListTeams を作る。
func NewListTeams(facilities FacilityRepository, teams TeamRepository) ListTeams {
	return ListTeams{facilities: facilities, teams: teams}
}

// Do は、事業所 facilityID の全てのチームを返す。事業所が見つからないときは apperr.ErrNotFound を返す。
func (o ListTeams) Do(ctx context.Context, facilityID string) ([]Team, error) {
	if _, err := o.facilities.Get(ctx, facilityID); err != nil {
		return nil, err
	}
	return o.teams.ListByFacility(ctx, facilityID)
}
