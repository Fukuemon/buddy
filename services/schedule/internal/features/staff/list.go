package staff

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/kernel"
)

// List は、事業所の職員を返す。
type List struct {
	facilities kernel.Finder[organization.Facility]
	staff      Repository
}

// NewList は List を作る。
func NewList(facilities kernel.Finder[organization.Facility], staff Repository) List {
	return List{facilities: facilities, staff: staff}
}

// Do は、事業所の職員を返す。事業所が見つからないときは apperr.ErrNotFound を返す。
func (s List) Do(ctx context.Context, facilityID string, q ListQuery) ([]Summary, error) {
	if _, err := s.facilities.Get(ctx, facilityID); err != nil {
		return nil, err
	}
	return s.staff.ListByFacility(ctx, facilityID, q)
}
