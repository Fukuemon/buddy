package patient

import (
	"context"
)

// List は、事業所の利用者を返す。事業所が見つからないときは apperr.ErrNotFound を返す。
func (p *Usecase) List(ctx context.Context, facilityID string, q ListQuery) ([]Detail, error) {
	if _, err := p.deps.Facilities.Get(ctx, facilityID); err != nil {
		return nil, err
	}
	return p.deps.Patients.ListByFacility(ctx, facilityID, q)
}
