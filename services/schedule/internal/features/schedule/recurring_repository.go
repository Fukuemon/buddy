package schedule

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
)

// RecurringRepository は、繰り返しの予定と規則と、除外する日付を書く。見つからないときは apperr.ErrNotFound を返す。
// AddExclusion は、繰り返しの予定の更新の番号を 1 つ増やす。同じ日付をすでに除外しているときは apperr.ErrConflict を返す。
// 名前を結合した繰り返しの予定は scheduleview が読む（ADR-0026）。
type RecurringRepository interface {
	Create(ctx context.Context, rs RecurringSchedule) error
	// GetForUpdate は、トランザクションの終わりまで繰り返しの予定の行に排他のロックを取り、ロックを取った後の値を返す。
	// トランザクションの最初に呼ぶ。
	GetForUpdate(ctx context.Context, id string) (StoredRecurring, error)
	AddExclusion(ctx context.Context, recurringScheduleID string, d civil.Date) error
}
