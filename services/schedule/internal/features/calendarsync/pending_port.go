package calendarsync

import (
	"context"
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendar"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
)

// PendingRecords は、同期が、予定の API が Google カレンダーに書いた予定の記録（calendar.EventRecord）の保留の版を確定するか消すために、
// 記録を読み書きする。実装は postgres.CalendarEventRecordRepository である。
// ClaimExpired と Release のほかは、トランザクションの中で呼ぶ。
type PendingRecords interface {
	calendar.EventRecords
	// ClaimExpired は、書く期限が now 以前の保留の版を持つ記録のうち、事業所の予定の管理先が modes にあり、保留の版を書く予定の
	// カレンダー（calendar.EventRecord.PendingLocation）を外していない記録を、書く期限の古い順に max 件まで取り、now に lease を足した時刻まで、ほかの処理に渡さないようにして返す。
	// 保留の版の状態（writing か unknown）では絞らない。
	ClaimExpired(ctx context.Context, now time.Time, max int, lease time.Duration, modes []organization.SourceMode) ([]PendingCheck, error)
	// Release は、ClaimExpired で取った p を、すぐにほかの処理が取れるように戻す。p を取った後にほかの処理が取り直していれば、何もしない。
	Release(ctx context.Context, p PendingCheck) error
}

// PendingCheck は、読み戻しが取った、書く期限を過ぎた保留の版を持つ記録と、保留の版を書く予定のカレンダーである。
// 予定を別のカレンダーに移す保留の版では、Calendar は移す先のカレンダーである。
type PendingCheck struct {
	Record   calendar.EventRecord
	Calendar calendar.ExternalCalendar
	// LockedUntil は、取ったときに決めた、ほかの処理に渡さない期限である。Release で、ほかの処理が取り直していないかを比べる。
	LockedUntil time.Time
}
