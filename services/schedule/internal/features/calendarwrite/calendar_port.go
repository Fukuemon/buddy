package calendarwrite

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendar"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/scheduleview"
)

// Calendars は、予定を書くカレンダーを読む。実装は postgres.CalendarRepository である。
type Calendars interface {
	// ActiveByStaff は、職員 staffID に結び付けた外していないカレンダーを返す。無いときは apperr.ErrNotFound を返す。
	ActiveByStaff(ctx context.Context, staffID string) (calendar.ExternalCalendar, error)
}

// Cutovers は、事業所の予定の正本の切り替えを読む。実装は postgres.CalendarProjectionRepository である。
type Cutovers interface {
	// FindOpenCutover は、事業所 facilityID の open の切り替えを返す。無ければ nil を返す。
	FindOpenCutover(ctx context.Context, facilityID string) (*scheduleview.OpenCutover, error)
}

// Projections は、Google が返した予定を Projection の行に写す。実装は postgres.CalendarProjectionRepository である。
type Projections interface {
	// Put は、p の行を足すか、同じカレンダーと Google の予定の ID の行を p にする。行を書き直すのは、行の GoogleUpdatedAt が nil か、
	// p の GoogleUpdatedAt の方が新しいときだけである（ADR-0026）。
	Put(ctx context.Context, p scheduleview.Projection) error
}
