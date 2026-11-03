package schedule

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/principal"
)

// List は、事業所の予定のうち、見てよい職員の予定を返す。事業所が見つからないときは apperr.ErrNotFound を返す。
func (s *App) List(ctx context.Context, facilityID string, q ListQuery) (List, error) {
	if err := q.Validate(); err != nil {
		return List{}, err
	}
	p, err := current(ctx)
	if err != nil {
		return List{}, err
	}
	if _, err := s.deps.Facilities.Get(ctx, facilityID); err != nil {
		return List{}, err
	}
	readable, err := s.readableStaff(ctx, p, facilityID)
	if err != nil {
		return List{}, err
	}
	single, err := s.deps.Schedules.ListByFacility(ctx, facilityID, q)
	if err != nil {
		return List{}, err
	}
	recurring, err := s.deps.Recurring.ListByFacility(ctx, facilityID, q)
	if err != nil {
		return List{}, err
	}
	return List{
		Schedules:          filter(single, func(d Detail) bool { return readable(d.StaffID) }),
		RecurringSchedules: filter(recurring, func(d RecurringDetail) bool { return readable(d.StaffID) }),
	}, nil
}

// readableStaff は、事業所の職員のうち、p が予定を見てよい職員かを返す関数を返す。
func (s *App) readableStaff(ctx context.Context, p principal.Principal, facilityID string) (func(staffID string) bool, error) {
	if CanReadAll(p) {
		return func(string) bool { return true }, nil
	}
	members, err := s.deps.Staff.ListByFacility(ctx, facilityID)
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

// List は、事業所の単発の予定と繰り返しの予定である。
type List struct {
	Schedules          []Detail
	RecurringSchedules []RecurringDetail
}
