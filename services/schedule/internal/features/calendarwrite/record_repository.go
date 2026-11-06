package calendarwrite

import "context"

// RecordRepository は、Google カレンダーに書いた予定の記録を読み書きする。実装は postgres.CalendarEventRecordRepository である。
// どのメソッドもトランザクションの中で呼ぶ。
type RecordRepository interface {
	// GetForUpdate は、予定 scheduleID の記録を、トランザクションが終わるまでほかの書き込みを待たせるロックを取って返す。
	// 無いときは apperr.ErrNotFound を返す。
	GetForUpdate(ctx context.Context, scheduleID string) (Record, error)
	// Create は、記録 r を書く。同じ予定か、同じカレンダーと Google の予定の ID の記録があるときは apperr.ErrConflict を返す。
	Create(ctx context.Context, r Record) error
	// Update は、記録 r の訪問の情報、版、保留の版を r の値にする。
	Update(ctx context.Context, r Record) error
	// Delete は、予定 scheduleID の記録を消す。無くてもエラーにしない。
	Delete(ctx context.Context, scheduleID string) error
}
