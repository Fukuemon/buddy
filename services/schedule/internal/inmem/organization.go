package inmem

import (
	"cmp"
	"context"
	"slices"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
)

// Facilities は、organization.FacilityRepository と、機能のパッケージの FacilityLock のメモリ上の実装である。
type Facilities struct{ *Store }

// Get は、organization.FacilityRepository の Get を実装する。
func (s Facilities) Get(_ context.Context, id string) (organization.Facility, error) {
	return get(s.Facilities, id)
}

// GetByOrgID は、organization.FacilityRepository の GetByOrgID を実装する。
func (s Facilities) GetByOrgID(_ context.Context, orgID string) (organization.Facility, error) {
	return get(s.Facilities, s.FacilityByOrg[orgID])
}

// Create は、organization.FacilityCreator を実装する。同じ組織の ID の事業所があるときは apperr.ErrConflict を返す。
func (s Facilities) Create(_ context.Context, f organization.Facility) error {
	if _, ok := s.FacilityByOrg[f.OrgID]; ok {
		return apperr.ErrConflict
	}
	s.Facilities[f.ID] = f
	s.FacilityByOrg[f.OrgID] = f.ID
	return nil
}

// Lock は、事業所があるかだけを確認する。メモリ上の実装はロックを取らない。
func (s Facilities) Lock(_ context.Context, facilityID string) error {
	_, err := get(s.Facilities, facilityID)
	return err
}

// Share は、事業所があるかだけを確認する。メモリ上の実装はロックを取らない。
func (s Facilities) Share(_ context.Context, facilityID string) error {
	_, err := get(s.Facilities, facilityID)
	return err
}

// GetForShare は、事業所を返す。メモリ上の実装はロックを取らない。
func (s Facilities) GetForShare(_ context.Context, facilityID string) (organization.Facility, error) {
	return get(s.Facilities, facilityID)
}

// Departments は、organization.DepartmentRepository のメモリ上の実装である。
type Departments struct{ *Store }

// Get は、organization.DepartmentRepository の Get を実装する。
func (s Departments) Get(_ context.Context, id string) (organization.Department, error) {
	return get(s.Departments, id)
}

// ListByFacility は、organization.DepartmentRepository の ListByFacility を実装する。
func (s Departments) ListByFacility(_ context.Context, facilityID string) ([]organization.Department, error) {
	var out []organization.Department
	for _, d := range s.Departments {
		if d.FacilityID == facilityID {
			out = append(out, d)
		}
	}
	return out, nil
}

// Create は、部署を保存する。同じ事業所に名前が完全に一致する部署があれば apperr.ErrConflict を返す。
// DB の一意の制約と同じく、完全に一致する名前だけを重なりとみなす。
func (s Departments) Create(_ context.Context, d organization.Department) error {
	for _, cur := range s.Departments {
		if cur.FacilityID == d.FacilityID && cur.Name == d.Name {
			return apperr.ErrConflict
		}
	}
	s.Departments[d.ID] = d
	return nil
}

// Update は、部署 d.ID の名前を d の値にする。部署が無ければ apperr.ErrNotFound を、
// 同じ事業所にほかの名前が完全に一致する部署があれば apperr.ErrConflict を返す。
func (s Departments) Update(_ context.Context, d organization.Department) error {
	cur, ok := s.Departments[d.ID]
	if !ok {
		return apperr.ErrNotFound
	}
	for _, other := range s.Departments {
		if other.ID != d.ID && other.FacilityID == cur.FacilityID && other.Name == d.Name {
			return apperr.ErrConflict
		}
	}
	cur.Name = d.Name
	s.Departments[d.ID] = cur
	return nil
}

// Teams は、organization.TeamRepository のメモリ上の実装である。
type Teams struct{ *Store }

// Get は、organization.TeamRepository の Get を実装する。
func (s Teams) Get(_ context.Context, id string) (organization.Team, error) { return get(s.Teams, id) }

// ListByFacility は、事業所 facilityID のチームを名前、ID の順に返す。
func (s Teams) ListByFacility(_ context.Context, facilityID string) ([]organization.Team, error) {
	var out []organization.Team
	for _, t := range s.Teams {
		if t.FacilityID == facilityID {
			out = append(out, t)
		}
	}
	slices.SortFunc(out, func(a, b organization.Team) int {
		return cmp.Or(cmp.Compare(a.Name, b.Name), cmp.Compare(a.ID, b.ID))
	})
	return out, nil
}

// Update は、チーム t.ID の名前と色を t の値にする。チームが無ければ apperr.ErrNotFound を、
// 同じ事業所にほかの名前が完全に一致するチームがあれば apperr.ErrConflict を返す。
func (s Teams) Update(_ context.Context, t organization.Team) error {
	cur, ok := s.Teams[t.ID]
	if !ok {
		return apperr.ErrNotFound
	}
	for _, other := range s.Teams {
		if other.ID != t.ID && other.FacilityID == cur.FacilityID && other.Name == t.Name {
			return apperr.ErrConflict
		}
	}
	cur.Name, cur.Color = t.Name, t.Color
	s.Teams[t.ID] = cur
	return nil
}

// Create は、チームを保存する。同じ事業所に名前が完全に一致するチームがあれば apperr.ErrConflict を返す。
// DB の一意の制約と同じく、完全に一致する名前だけを重なりとみなす。
func (s Teams) Create(_ context.Context, t organization.Team) error {
	for _, cur := range s.Teams {
		if cur.FacilityID == t.FacilityID && cur.Name == t.Name {
			return apperr.ErrConflict
		}
	}
	s.Teams[t.ID] = t
	return nil
}

// Positions は、organization.PositionRepository のメモリ上の実装である。
type Positions struct{ *Store }

// Get は、organization.PositionRepository の Get を実装する。
func (s Positions) Get(_ context.Context, id string) (organization.Position, error) {
	return get(s.Positions, id)
}

// ListByFacility は、事業所 facilityID の役職を名前と ID の順に返す。
func (s Positions) ListByFacility(_ context.Context, facilityID string) ([]organization.Position, error) {
	var out []organization.Position
	for _, p := range s.Positions {
		if p.FacilityID == facilityID {
			out = append(out, p)
		}
	}
	slices.SortFunc(out, func(a, b organization.Position) int {
		return cmp.Or(cmp.Compare(a.Name, b.Name), cmp.Compare(a.ID, b.ID))
	})
	return out, nil
}

// Create は、役職を保存する。同じ事業所に名前が完全に一致する役職があれば apperr.ErrConflict を返す。
// DB の一意の制約と同じく、完全に一致する名前だけを重なりとみなす。
func (s Positions) Create(_ context.Context, p organization.Position) error {
	for _, cur := range s.Positions {
		if cur.FacilityID == p.FacilityID && cur.Name == p.Name {
			return apperr.ErrConflict
		}
	}
	s.Positions[p.ID] = p
	return nil
}

// Policies は、organization.PolicyRepository のメモリ上の実装である。
type Policies struct{ *Store }

// Get は、organization.PolicyRepository の Get を実装する。
func (s Policies) Get(_ context.Context, id string) (organization.Policy, error) {
	return get(s.Policies, id)
}

// List は、全ての権限を名前と ID の順に返す。
func (s Policies) List(context.Context) ([]organization.Policy, error) {
	out := make([]organization.Policy, 0, len(s.Policies))
	for _, p := range s.Policies {
		out = append(out, p)
	}
	slices.SortFunc(out, func(a, b organization.Policy) int {
		return cmp.Or(cmp.Compare(a.Name, b.Name), cmp.Compare(a.ID, b.ID))
	})
	return out, nil
}

// ListByIDs は、organization.PolicyRepository の ListByIDs を実装する。
func (s Policies) ListByIDs(_ context.Context, ids []string) ([]organization.Policy, error) {
	var out []organization.Policy
	for _, id := range ids {
		if p, ok := s.Policies[id]; ok {
			out = append(out, p)
		}
	}
	return out, nil
}
