package organization

import (
	"context"
)

// GetFacility は、事業所 id を返す。
type GetFacility struct {
	facilities FacilityRepository
}

// NewGetFacility は GetFacility を作る。
func NewGetFacility(facilities FacilityRepository) GetFacility {
	return GetFacility{facilities: facilities}
}

// Do は、事業所 id を返す。見つからないときは apperr.ErrNotFound を返す。
func (o GetFacility) Do(ctx context.Context, id string) (Facility, error) {
	return o.facilities.Get(ctx, id)
}
