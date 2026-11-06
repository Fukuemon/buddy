package calendarwrite

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendar"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/scheduleview"
)

// Calendars は、予定を書くカレンダーを読む。実装は postgres.CalendarRepository である。
type Calendars interface {
	// ActiveByStaff は、職員 staffID に結び付けた外していないカレンダーを返す。無いときは apperr.ErrNotFound を返す。
	ActiveByStaff(ctx context.Context, staffID string) (calendar.ExternalCalendar, error)
	// Get は、ID が id の結び付けたカレンダーを返す。無いときは apperr.ErrNotFound を返す。
	Get(ctx context.Context, id string) (calendar.ExternalCalendar, error)
}

// Cutovers は、事業所の予定の正本の切り替えを読む。実装は postgres.CalendarProjectionRepository である。
type Cutovers interface {
	// FindOpenCutover は、事業所 facilityID の open の切り替えを返す。無ければ nil を返す。
	FindOpenCutover(ctx context.Context, facilityID string) (*scheduleview.OpenCutover, error)
}

// Projections は、Google が返した予定を Projection の行に写し、変えるか取り消す予定の行を読む。実装は postgres.CalendarProjectionRepository である。
type Projections interface {
	// Put は、p の行を足すか、同じカレンダーと Google の予定の ID の行を p にする。行を書き直すのは、行の GoogleUpdatedAt が nil か、
	// p の GoogleUpdatedAt の方が新しいときだけである（ADR-0026）。
	Put(ctx context.Context, p scheduleview.Projection) error
	// GetBySchedule は、事業所 facilityID の外していないカレンダーの、一覧での予定の ID が id の行を返す。無いときは apperr.ErrNotFound を返す。
	GetBySchedule(ctx context.Context, facilityID, id string) (scheduleview.ProjectionDetail, error)
	// ListByFacility は、事業所の外していないカレンダーの行のうち、終わる日が from より前でない行（終わる日の無い行を含む）を返す。
	// 一覧での ID から繰り返しの予定の展開した回を引くのに使う。
	ListByFacility(ctx context.Context, facilityID string, from civil.Date) ([]scheduleview.ProjectionDetail, error)
}
