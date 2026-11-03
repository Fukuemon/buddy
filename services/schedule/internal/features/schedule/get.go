package schedule

import (
	"context"
)

// Get は、単発の予定を返す。
func (s *Usecase) Get(ctx context.Context, id string) (Detail, error) {
	d, err := s.deps.Schedules.Get(ctx, id)
	if err != nil {
		return Detail{}, err
	}
	if err := s.requireScheduleAccess(ctx, d.StaffID, false); err != nil {
		return Detail{}, err
	}
	return d, nil
}
