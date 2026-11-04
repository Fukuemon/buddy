package scheduleview

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/features/schedule"
)

// Get は、単発の予定を返す。
type Get struct {
	schedules Schedules
	staff     StaffRefs
}

// NewGet は Get を作る。
func NewGet(schedules Schedules, staff StaffRefs) Get {
	return Get{schedules: schedules, staff: staff}
}

// Do は、単発の予定を返す。
func (s Get) Do(ctx context.Context, id string) (Detail, error) {
	d, err := s.schedules.Get(ctx, id)
	if err != nil {
		return Detail{}, err
	}
	if err := schedule.RequireScheduleAccess(ctx, s.staff, d.StaffID, false); err != nil {
		return Detail{}, err
	}
	return d, nil
}
