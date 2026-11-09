package patient

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/kernel"
)

// List は、事業所の利用者を返す。
type List struct {
	facilities kernel.Finder[organization.Facility]
	patients   Repository
}

// NewList は List を作る。
func NewList(facilities kernel.Finder[organization.Facility], patients Repository) List {
	return List{facilities: facilities, patients: patients}
}

// Do は、事業所の利用者を返す。事業所が見つからないときは apperr.ErrNotFound を返す。
func (p List) Do(ctx context.Context, facilityID string, q ListQuery) ([]Detail, error) {
	if _, err := p.facilities.Get(ctx, facilityID); err != nil {
		return nil, err
	}
	return p.patients.ListByFacility(ctx, facilityID, q)
}
