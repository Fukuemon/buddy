package scheduleview

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
)

// Projections は、Google カレンダーの予定の写し（Projection）を読む。実装は postgres.CalendarProjectionRepository である。
type Projections interface {
	// ListByFacility は、事業所の外していないカレンダーの行のうち、終わる日が from より前でない行（終わる日の無い行を含む）を返す。
	// 外したカレンダー（退職した職員のカレンダーを含む）の行は返さない。
	ListByFacility(ctx context.Context, facilityID string, from civil.Date) ([]ProjectionDetail, error)
}
