package scheduleview

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/features/schedule"
)

// Schedules は、単発の予定を読む。Get は、見つからないときに apperr.ErrNotFound を返す。
type Schedules interface {
	Get(ctx context.Context, id string) (schedule.Detail, error)
	ListByFacility(ctx context.Context, facilityID string, q schedule.ListQuery) ([]schedule.Detail, error)
}

// RecurringSchedules は、繰り返しの予定を読む。Get は、見つからないときに apperr.ErrNotFound を返す。
type RecurringSchedules interface {
	Get(ctx context.Context, id string) (schedule.RecurringDetail, error)
	ListByFacility(ctx context.Context, facilityID string, q schedule.ListQuery) ([]schedule.RecurringDetail, error)
}
