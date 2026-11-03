package schedule

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
)

// RecurringRepository は、繰り返しの予定と規則と、除外する日付を読み書きする。見つからないときは apperr.ErrNotFound を返す。
// AddExclusion は、繰り返しの予定の更新の番号を 1 つ増やす。同じ日付をすでに除外しているときは apperr.ErrConflict を返す。
type RecurringRepository interface {
	Create(ctx context.Context, rs RecurringSchedule) error
	Get(ctx context.Context, id string) (RecurringDetail, error)
	ListByFacility(ctx context.Context, facilityID string, q ListQuery) ([]RecurringDetail, error)
	AddExclusion(ctx context.Context, recurringScheduleID string, d civil.Date) error
}
