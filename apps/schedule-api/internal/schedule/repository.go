package schedule

import (
	"context"

	"github.com/Fukuemon/buddy/apps/schedule-api/internal/civil"
)

// Repository は、予定と予定の種類を読み書きする。見つからないときは domain.ErrNotFound を返す。
// AddExclusion は同じ日付をすでに除外しているときに、CreateCancel はキャンセル済みのときに domain.ErrConflict を返す。
type Repository interface {
	GetType(ctx context.Context, id string) (Type, error)
	ListTypes(ctx context.Context) ([]Type, error)

	Create(ctx context.Context, s Schedule) error
	// Lock は、トランザクションの終わりまで予定の行に排他のロックを取る。予定が無いときは domain.ErrNotFound を返す。
	// トランザクションの最初に呼ぶ。後の読み取りは、ロックを取った後の値を読む。
	Lock(ctx context.Context, id string) error
	// Update は、ID が s.ID の予定の枠を s の値に置き換える。事業所と RecurringScheduleID は変えない。予定が無くてもエラーにしない。
	Update(ctx context.Context, s Schedule) error
	Get(ctx context.Context, id string) (Detail, error)
	ListByFacility(ctx context.Context, facilityID string, q ListQuery) ([]Detail, error)

	CreateRecurring(ctx context.Context, rs RecurringSchedule) error
	GetRecurring(ctx context.Context, id string) (RecurringDetail, error)
	ListRecurringByFacility(ctx context.Context, facilityID string, q ListQuery) ([]RecurringDetail, error)
	AddExclusion(ctx context.Context, recurringScheduleID string, d civil.Date) error

	CreateCancel(ctx context.Context, c Cancel) error
}
