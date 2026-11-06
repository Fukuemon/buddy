package scheduleview

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
)

// Projections は、Google カレンダーの予定の写し（Projection）を読む。実装は postgres.CalendarProjectionRepository である。
// どのメソッドも、記録のある行には、記録の確定した版の訪問の情報（ProjectionDetail.Visit）を付けて返す。
type Projections interface {
	// ListByFacility は、事業所の外していないカレンダーの行のうち、終わる日が from より前でない行（終わる日の無い行を含む）を返す。
	// 外したカレンダー（退職した職員のカレンダーを含む）の行は返さない。
	ListByFacility(ctx context.Context, facilityID string, from civil.Date) ([]ProjectionDetail, error)
	// GetBySchedule は、事業所 facilityID の外していないカレンダーの行のうち、一覧での予定の ID が id の行を返す。
	// 記録の予定の ID が id なら、記録が指すカレンダーと Google の予定の ID の行を返す。記録の無い行は ListScheduleID の値で引く。
	// 無いときは apperr.ErrNotFound を返す。
	GetBySchedule(ctx context.Context, facilityID, id string) (ProjectionDetail, error)
	RecordedEvents
}

// RecordedEvents は、予定の API が Google カレンダーに書いた予定の記録（calendar.EventRecord）を、主キーで引く。
// 実装は postgres.CalendarProjectionRepository である。
type RecordedEvents interface {
	// ListRecordedEvents は、ids のうち、事業所 facilityID の記録の主キーで、確定した版（Google が受けたと分かった版）を持つ記録の、
	// 確定した版の予定の場所を、主キーごとに返す。保留の版だけを持つ記録は返さない。1 回の問い合わせで引く。
	ListRecordedEvents(ctx context.Context, facilityID string, ids []string) (map[string]RecordedEvent, error)
}

// RecordedEvent は、記録が指す、Google が受けたと分かった版の予定の場所である。
type RecordedEvent struct {
	ExternalCalendarID string
	ExternalEventID    string
}
