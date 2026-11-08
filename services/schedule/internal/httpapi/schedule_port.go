package httpapi

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/schedule"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/scheduleview"
)

// ScheduleApp は、予定のハンドラが使う操作である。予定を書く操作は書いた予定を返し、ハンドラは応答を Get と GetRecurring で読み直して作る（ADR-0026）。
// GetProjected は、google_primary の事業所の、一覧での ID が id の Projection の単発の予定を返す。
// 組み立ての場所が、schedule と scheduleview の操作の型の Do を入れる。入れていない操作を呼ぶと panic する（ADR-0024）。
type ScheduleApp struct {
	ListTypes        func(ctx context.Context) ([]schedule.Type, error)
	Get              func(ctx context.Context, id string) (scheduleview.Detail, error)
	GetProjected     func(ctx context.Context, facilityID, id string) (scheduleview.Detail, error)
	GetRecurring     func(ctx context.Context, id string) (scheduleview.RecurringDetail, error)
	List             func(ctx context.Context, facilityID string, q scheduleview.ListQuery) (scheduleview.Listing, error)
	Create           func(ctx context.Context, facilityID string, in schedule.SlotInput) (schedule.Schedule, error)
	CreateRecurring  func(ctx context.Context, facilityID string, in schedule.SlotInput, rule schedule.RuleInput) (schedule.RecurringSchedule, error)
	ChangeOccurrence func(ctx context.Context, recurringScheduleID string, originalDate civil.Date, in schedule.SlotInput) (schedule.Schedule, error)
	// ChangeRule は、繰り返しの予定の規則を、適用の日以降の回について変え、適用の日以降の回を持つ繰り返しの予定を返す（ADR-0037）。
	ChangeRule       func(ctx context.Context, recurringScheduleID string, effective *civil.Date, rule schedule.RuleInput) (schedule.RecurringSchedule, error)
	Cancel           func(ctx context.Context, scheduleID, reason string) (schedule.Cancellation, error)
	CancelOccurrence func(ctx context.Context, recurringScheduleID string, originalDate civil.Date, reason string) (schedule.Cancellation, error)
	Update           func(ctx context.Context, scheduleID string, in schedule.SlotInput) (schedule.Schedule, error)
}
