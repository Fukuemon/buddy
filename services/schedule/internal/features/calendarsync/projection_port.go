package calendarsync

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/scheduleview"
)

// Projections は、ProjectionApplier が、Google カレンダーの予定の写し（Projection）の行を書く。実装は postgres.CalendarProjectionRepository である。
// どのメソッドも、Syncer が開くトランザクションの中で呼ぶ。
type Projections interface {
	// Put は、p の行を足すか、同じカレンダーと Google の予定の ID の行を p にする。行を書き直すのは、行の GoogleUpdatedAt が nil か、
	// p の GoogleUpdatedAt の方が新しいときだけである。後から届いた古い内容で、新しい内容を上書きしないためである（ADR-0029）。
	Put(ctx context.Context, p scheduleview.Projection) error
	// CancelOccurrences は、カレンダー externalCalendarID の、親の予定 parentEventID の例外の回の行を、取り消した回の行にする。
	// 元の開始と終わる日は残し、タイトルと日時は消す。
	CancelOccurrences(ctx context.Context, externalCalendarID, parentEventID string) error
	// Delete は、カレンダー externalCalendarID の予定 eventID の行と、その予定を親にする例外の回の行を消す。行が無くてもエラーにしない。
	Delete(ctx context.Context, externalCalendarID, eventID string) error
	// DeleteExcept は、カレンダー externalCalendarID の行のうち、Google の予定の ID が eventIDs に無い行を消す。
	DeleteExcept(ctx context.Context, externalCalendarID string, eventIDs []string) error
	// DeleteEndedBefore は、カレンダー externalCalendarID の行のうち、終わる日が before より前の行を消す。終わる日の無い行は残す。
	DeleteEndedBefore(ctx context.Context, externalCalendarID string, before civil.Date) error
}
