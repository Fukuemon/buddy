package inmem

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/principal"
)

// GetIDByOrgID は、組織 orgID に結び付けた事業所の ID を返す。
func (s Facilities) GetIDByOrgID(ctx context.Context, orgID string) (string, error) {
	f, err := s.GetByOrgID(ctx, orgID)
	return f.ID, err
}

// GetPrincipal は、職員 id の、認可に要る項目を返す。
func (s Staff) GetPrincipal(_ context.Context, id string) (principal.Staff, error) {
	d, err := get(s.Staff, id)
	if err != nil {
		return principal.Staff{}, err
	}
	return principal.FromDetail(d), nil
}

// FacilityOf は、部署 id の事業所の ID を返す。
func (s Departments) FacilityOf(_ context.Context, id string) (string, error) {
	d, err := get(s.Departments, id)
	return d.FacilityID, err
}

// FacilityOf は、チーム id の事業所の ID を返す。
func (s Teams) FacilityOf(_ context.Context, id string) (string, error) {
	t, err := get(s.Teams, id)
	return t.FacilityID, err
}

// FacilityOf は、役職 id の事業所の ID を返す。
func (s Positions) FacilityOf(_ context.Context, id string) (string, error) {
	p, err := get(s.Positions, id)
	return p.FacilityID, err
}

// FacilityOf は、職員 id の事業所の ID を返す。
func (s StaffRefs) FacilityOf(_ context.Context, id string) (string, error) {
	d, err := get(s.Staff, id)
	return d.FacilityID, err
}

// FacilityOf は、利用者 id の事業所の ID を返す。
func (s Patients) FacilityOf(_ context.Context, id string) (string, error) {
	p, err := get(s.Patients, id)
	return p.FacilityID, err
}

// FacilityOf は、予定 id の事業所の ID を返す。
func (s Schedules) FacilityOf(_ context.Context, id string) (string, error) {
	d, err := get(s.Schedules, id)
	return d.FacilityID, err
}

// FacilityOf は、繰り返しの予定 id の事業所の ID を返す。
func (s RecurringSchedules) FacilityOf(_ context.Context, id string) (string, error) {
	d, err := get(s.Recurring, id)
	return d.FacilityID, err
}

// FacilityOf は、外部のカレンダー id の事業所の ID を返す。
func (s Calendars) FacilityOf(_ context.Context, id string) (string, error) {
	c, err := get(s.Calendars, id)
	return c.FacilityID, err
}

// FacilityOf は、書き出しの待ち id の事業所の ID を返す。
func (s Exports) FacilityOf(_ context.Context, id string) (string, error) {
	e, err := get(s.Exports, id)
	return e.FacilityID, err
}
