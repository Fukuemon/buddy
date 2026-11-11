package calendarimport

import "context"

// Projections は、移行の完了が、事業所の Google カレンダーの予定の写し（Projection）を消す。実装は postgres.CalendarProjectionRepository である。
type Projections interface {
	// DeleteByFacility は、事業所 facilityID の Projection の行を全て消す。トランザクションの中で呼ぶ。
	DeleteByFacility(ctx context.Context, facilityID string) error
}
