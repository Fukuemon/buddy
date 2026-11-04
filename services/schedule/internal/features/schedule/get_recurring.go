package schedule

import (
	"context"
)

// GetRecurring は、繰り返しの予定を返す。
type GetRecurring struct {
	recurring RecurringRepository
	staff     StaffRefs
}

// NewGetRecurring は GetRecurring を作る。
func NewGetRecurring(recurring RecurringRepository, staff StaffRefs) GetRecurring {
	return GetRecurring{recurring: recurring, staff: staff}
}

// Do は、繰り返しの予定を返す。
func (s GetRecurring) Do(ctx context.Context, id string) (RecurringDetail, error) {
	d, err := s.recurring.Get(ctx, id)
	if err != nil {
		return RecurringDetail{}, err
	}
	if err := requireScheduleAccess(ctx, s.staff, d.StaffID, false); err != nil {
		return RecurringDetail{}, err
	}
	return d, nil
}
