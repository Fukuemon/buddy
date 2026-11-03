package schedule

import (
	"context"
)

// GetRecurring は、繰り返しの予定を返す。
func (s *App) GetRecurring(ctx context.Context, id string) (RecurringDetail, error) {
	d, err := s.deps.Recurring.Get(ctx, id)
	if err != nil {
		return RecurringDetail{}, err
	}
	if err := s.requireScheduleAccess(ctx, d.StaffID, false); err != nil {
		return RecurringDetail{}, err
	}
	return d, nil
}
