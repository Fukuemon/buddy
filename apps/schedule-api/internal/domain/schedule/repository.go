package schedule

import (
	"context"

	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain/civil"
)

// Repository は、予定と予定の種類を読み書きする。見つからないときは domain.ErrNotFound を返す。
// AddExclusion は同じ日付をすでに除外しているときに、CreateCancel はキャンセル済みのときに domain.ErrConflict を返す。
type Repository interface {
	GetType(ctx context.Context, id string) (Type, error)
	ListTypes(ctx context.Context) ([]Type, error)

	Create(ctx context.Context, s Schedule) error
	// Update は、ID が s.ID の予定の枠を s の値に置き換える。RecurringScheduleID は変えない。
	Update(ctx context.Context, s Schedule) error
	Get(ctx context.Context, id string) (Detail, error)
	ListByFacility(ctx context.Context, facilityID string, q ListQuery) ([]Detail, error)

	CreateRecurring(ctx context.Context, rs RecurringSchedule) error
	GetRecurring(ctx context.Context, id string) (RecurringDetail, error)
	ListRecurringByFacility(ctx context.Context, facilityID string, q ListQuery) ([]RecurringDetail, error)
	AddExclusion(ctx context.Context, recurringScheduleID string, d civil.Date) error

	CreateCancel(ctx context.Context, c Cancel) error
}
