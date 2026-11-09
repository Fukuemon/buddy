package scheduleview

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/features/schedule"
)

// GetRecurring は、繰り返しの予定を返す。
type GetRecurring struct {
	recurring RecurringSchedules
	staff     StaffRefs
}

// NewGetRecurring は GetRecurring を作る。
func NewGetRecurring(recurring RecurringSchedules, staff StaffRefs) GetRecurring {
	return GetRecurring{recurring: recurring, staff: staff}
}

// Do は、繰り返しの予定を返す。
func (s GetRecurring) Do(ctx context.Context, id string) (RecurringDetail, error) {
	d, err := s.recurring.Get(ctx, id)
	if err != nil {
		return RecurringDetail{}, err
	}
	if err := schedule.RequireScheduleAccess(ctx, s.staff, d.StaffID, false); err != nil {
		return RecurringDetail{}, err
	}
	return d, nil
}
