package calendarwrite

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendar"
)

// RecordRepository は、Google カレンダーに書いた予定の記録（calendar.EventRecord）を読み書きする。
// 実装は postgres.CalendarEventRecordRepository である。どのメソッドもトランザクションの中で呼ぶ。
type RecordRepository interface {
	calendar.EventRecords
	// Create は、記録 r を書く。同じ予定か、同じカレンダーと Google の予定の ID の記録があるときは apperr.ErrConflict を返す。
	Create(ctx context.Context, r calendar.EventRecord) error
	// FindAtForUpdate は、Google の予定 at を指す記録を、GetForUpdate と同じロックを取って返す。無ければ ok を false にする。
	FindAtForUpdate(ctx context.Context, at calendar.EventLocation) (r calendar.EventRecord, ok bool, err error)
}
