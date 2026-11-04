package schedule

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/kernel"
	"github.com/Fukuemon/buddy/services/schedule/internal/principal"
)

// List は、事業所の予定のうち、見てよい職員の予定を返す。
type List struct {
	facilities kernel.Finder[organization.Facility]
	schedules  Repository
	recurring  RecurringRepository
	staff      StaffRefs
}

// NewList は List を作る。
func NewList(facilities kernel.Finder[organization.Facility], schedules Repository, recurring RecurringRepository, staff StaffRefs) List {
	return List{facilities: facilities, schedules: schedules, recurring: recurring, staff: staff}
}

// Do は、事業所の予定のうち、見てよい職員の予定を返す。事業所が見つからないときは apperr.ErrNotFound を返す。
func (s List) Do(ctx context.Context, facilityID string, q ListQuery) (Listing, error) {
	if err := q.Validate(); err != nil {
		return Listing{}, err
	}
	p, err := current(ctx)
	if err != nil {
		return Listing{}, err
	}
	if _, err := s.facilities.Get(ctx, facilityID); err != nil {
		return Listing{}, err
	}
	readable, err := s.readableStaff(ctx, p, facilityID)
	if err != nil {
		return Listing{}, err
	}
	single, err := s.schedules.ListByFacility(ctx, facilityID, q)
	if err != nil {
		return Listing{}, err
	}
	recurring, err := s.recurring.ListByFacility(ctx, facilityID, q)
	if err != nil {
		return Listing{}, err
	}
	return Listing{
		Schedules:          filter(single, func(d Detail) bool { return readable(d.StaffID) }),
		RecurringSchedules: filter(recurring, func(d RecurringDetail) bool { return readable(d.StaffID) }),
	}, nil
}

// readableStaff は、事業所の職員のうち、p が予定を見てよい職員かを返す関数を返す。
func (s List) readableStaff(ctx context.Context, p principal.Principal, facilityID string) (func(staffID string) bool, error) {
	if CanReadAll(p) {
		return func(string) bool { return true }, nil
	}
	members, err := s.staff.ListByFacility(ctx, facilityID)
	if err != nil {
		return nil, err
	}
	return readable(p, members), nil
}

func filter[T any](items []T, keep func(T) bool) []T {
	out := make([]T, 0, len(items))
	for _, it := range items {
		if keep(it) {
			out = append(out, it)
		}
	}
	return out
}

// Listing は、事業所の単発の予定と繰り返しの予定である。
type Listing struct {
	Schedules          []Detail
	RecurringSchedules []RecurringDetail
}
