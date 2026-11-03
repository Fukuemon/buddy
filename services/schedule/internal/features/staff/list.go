package staff

import "context"

// List は、事業所の職員を返す。事業所が見つからないときは apperr.ErrNotFound を返す。
func (s *Usecase) List(ctx context.Context, facilityID string, q ListQuery) ([]Summary, error) {
	if _, err := s.deps.Facilities.Get(ctx, facilityID); err != nil {
		return nil, err
	}
	return s.deps.Staff.ListByFacility(ctx, facilityID, q)
}
