package inmem

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/principal"
)

// GetIDByOrgID は、access.Facilities の GetIDByOrgID を実装する。
func (s Facilities) GetIDByOrgID(ctx context.Context, orgID string) (string, error) {
	f, err := s.GetByOrgID(ctx, orgID)
	return f.ID, err
}

// GetPrincipal は、access.Staff の GetPrincipal を実装する。
func (s Staff) GetPrincipal(_ context.Context, id string) (principal.Staff, error) {
	d, err := get(s.Staff, id)
	if err != nil {
		return principal.Staff{}, err
	}
	return principal.StaffOf(d), nil
}

// GetFacilityID は、access.FacilityReader の GetFacilityID を実装する。
func (s Departments) GetFacilityID(_ context.Context, id string) (string, error) {
	d, err := get(s.Departments, id)
	return d.FacilityID, err
}

// GetFacilityID は、access.FacilityReader の GetFacilityID を実装する。
func (s Teams) GetFacilityID(_ context.Context, id string) (string, error) {
	t, err := get(s.Teams, id)
	return t.FacilityID, err
}

// GetFacilityID は、access.FacilityReader の GetFacilityID を実装する。
func (s Positions) GetFacilityID(_ context.Context, id string) (string, error) {
	p, err := get(s.Positions, id)
	return p.FacilityID, err
}

// GetFacilityID は、access.FacilityReader の GetFacilityID を実装する。
func (s StaffRefs) GetFacilityID(_ context.Context, id string) (string, error) {
	d, err := get(s.Staff, id)
	return d.FacilityID, err
}

// GetFacilityID は、access.FacilityReader の GetFacilityID を実装する。
func (s Patients) GetFacilityID(_ context.Context, id string) (string, error) {
	p, err := get(s.Patients, id)
	return p.FacilityID, err
}

// GetFacilityID は、access.FacilityReader の GetFacilityID を実装する。
func (s Schedules) GetFacilityID(_ context.Context, id string) (string, error) {
	d, err := get(s.Schedules, id)
	return d.FacilityID, err
}

// GetFacilityID は、access.FacilityReader の GetFacilityID を実装する。
func (s RecurringSchedules) GetFacilityID(_ context.Context, id string) (string, error) {
	d, err := get(s.Recurring, id)
	return d.FacilityID, err
}

// GetFacilityID は、access.FacilityReader の GetFacilityID を実装する。
func (s Calendars) GetFacilityID(_ context.Context, id string) (string, error) {
	c, err := get(s.Calendars, id)
	return c.FacilityID, err
}

// GetFacilityID は、access.FacilityReader の GetFacilityID を実装する。
func (s Exports) GetFacilityID(_ context.Context, id string) (string, error) {
	e, err := get(s.Exports, id)
	return e.FacilityID, err
}
