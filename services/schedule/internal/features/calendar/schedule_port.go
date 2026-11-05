package calendar

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/schedule"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/scheduleview"
)

// Types は、取り込む予定の種類を読む。
type Types interface {
	List(ctx context.Context) ([]schedule.Type, error)
}

// ScheduleStore は、外部の予定の変更を当てる単発の予定を読み書きする。実装は schedule.Repository と scheduleview.Schedules である。
// Get は名前を結合した予定を、GetForUpdate と ReplacementOf は名前を結合しない書き込みのモデルを返す（ADR-0023）。
type ScheduleStore interface {
	Create(ctx context.Context, s schedule.Schedule) error
	Get(ctx context.Context, id string) (scheduleview.Detail, error)
	// GetForUpdate は、トランザクションの終わりまで予定の行に排他のロックを取り、ロックを取った後の値を返す。
	GetForUpdate(ctx context.Context, id string) (schedule.Stored, error)
	Update(ctx context.Context, s schedule.Schedule) error
	CreateCancel(ctx context.Context, c schedule.Cancellation) error
	// ReplacementOf は、繰り返しの予定 recurringScheduleID の d の回を置き換えた単発の予定を返す。無いときは apperr.ErrNotFound を返す。
	ReplacementOf(ctx context.Context, recurringScheduleID string, d civil.Date) (schedule.Stored, error)
}

// RecurringStore は、外部の繰り返しの予定の回の変更を当てる繰り返しの予定を読み書きする。
// Get は名前を結合した繰り返しの予定を、GetForUpdate は名前を結合しない書き込みのモデルを返す。
// AddExclusion は、繰り返しの予定の更新の番号を 1 つ増やす。
type RecurringStore interface {
	Get(ctx context.Context, id string) (scheduleview.RecurringDetail, error)
	// GetForUpdate は、トランザクションの終わりまで繰り返しの予定の行に排他のロックを取り、ロックを取った後の値を返す。
	GetForUpdate(ctx context.Context, id string) (schedule.StoredRecurring, error)
	AddExclusion(ctx context.Context, recurringScheduleID string, d civil.Date) error
}
