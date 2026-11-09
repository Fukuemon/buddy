package scheduleview

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/features/schedule"
)

// ScheduleTypes は、Projection の予定に付ける予定の種類のマスタを読む。
type ScheduleTypes interface {
	List(ctx context.Context) ([]schedule.Type, error)
}

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
