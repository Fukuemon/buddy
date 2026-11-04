package httpapi

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/schedule"
)

// ScheduleApp は、予定のハンドラが使う操作である。
// 組み立ての場所が、schedule の操作の型の Do を入れる。入れていない操作を呼ぶと panic する（ADR-0031）。
type ScheduleApp struct {
	ListTypes        func(ctx context.Context) ([]schedule.Type, error)
	Get              func(ctx context.Context, id string) (schedule.Detail, error)
	GetRecurring     func(ctx context.Context, id string) (schedule.RecurringDetail, error)
	List             func(ctx context.Context, facilityID string, q schedule.ListQuery) (schedule.Listing, error)
	Create           func(ctx context.Context, facilityID string, in schedule.SlotInput) (schedule.Detail, error)
	CreateRecurring  func(ctx context.Context, facilityID string, in schedule.SlotInput, rule schedule.RuleInput) (schedule.RecurringDetail, error)
	ChangeOccurrence func(ctx context.Context, recurringScheduleID string, originalDate civil.Date, in schedule.SlotInput) (schedule.Detail, error)
	Cancel           func(ctx context.Context, scheduleID, reason string) (schedule.Cancellation, error)
	Update           func(ctx context.Context, scheduleID string, in schedule.SlotInput) (schedule.Detail, error)
}
