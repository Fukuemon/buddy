package scheduleview

import (
	"context"
)

// Schedules は、単発の予定を読む。Get は、見つからないときに apperr.ErrNotFound を返す。
type Schedules interface {
	Get(ctx context.Context, id string) (Detail, error)
	ListByFacility(ctx context.Context, facilityID string, q ListQuery) ([]Detail, error)
}

// RecurringSchedules は、繰り返しの予定を読む。Get は、見つからないときに apperr.ErrNotFound を返す。
type RecurringSchedules interface {
	Get(ctx context.Context, id string) (RecurringDetail, error)
	ListByFacility(ctx context.Context, facilityID string, q ListQuery) ([]RecurringDetail, error)
}
