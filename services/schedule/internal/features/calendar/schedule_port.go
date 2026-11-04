package calendar

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/schedule"
)

// Types は、取り込む予定の種類を読む。
type Types interface {
	List(ctx context.Context) ([]schedule.Type, error)
}

// ScheduleStore は、外部の予定の変更を当てる単発の予定を読み書きする。実装は schedule.Repository である。
type ScheduleStore interface {
	Create(ctx context.Context, s schedule.Schedule) error
	Get(ctx context.Context, id string) (schedule.Detail, error)
	// GetForUpdate は、トランザクションの終わりまで予定の行に排他のロックを取り、ロックを取った後の値を返す。
	GetForUpdate(ctx context.Context, id string) (schedule.Detail, error)
	Update(ctx context.Context, s schedule.Schedule) error
	CreateCancel(ctx context.Context, c schedule.Cancellation) error
	// ReplacementOf は、繰り返しの予定 recurringScheduleID の d の回を置き換えた単発の予定を返す。無いときは apperr.ErrNotFound を返す。
	ReplacementOf(ctx context.Context, recurringScheduleID string, d civil.Date) (schedule.Detail, error)
}

// RecurringStore は、外部の繰り返しの予定の回の変更を当てる繰り返しの予定を読み書きする。
// AddExclusion は、繰り返しの予定の更新の番号を 1 つ増やす。
type RecurringStore interface {
	Get(ctx context.Context, id string) (schedule.RecurringDetail, error)
	// GetForUpdate は、トランザクションの終わりまで繰り返しの予定の行に排他のロックを取り、ロックを取った後の値を返す。
	GetForUpdate(ctx context.Context, id string) (schedule.RecurringDetail, error)
	AddExclusion(ctx context.Context, recurringScheduleID string, d civil.Date) error
}
