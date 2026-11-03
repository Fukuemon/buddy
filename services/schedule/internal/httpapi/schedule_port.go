package httpapi

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/schedule"
)

// ScheduleApp は、予定のハンドラが使う操作である。
type ScheduleApp interface {
	ListTypes(ctx context.Context) ([]schedule.Type, error)
	Get(ctx context.Context, id string) (schedule.Detail, error)
	GetRecurring(ctx context.Context, id string) (schedule.RecurringDetail, error)
	List(ctx context.Context, facilityID string, q schedule.ListQuery) (schedule.List, error)
	Create(ctx context.Context, facilityID string, in schedule.SlotInput) (schedule.Detail, error)
	CreateRecurring(ctx context.Context, facilityID string, in schedule.SlotInput, rule schedule.RuleInput) (schedule.RecurringDetail, error)
	ChangeOccurrence(ctx context.Context, recurringScheduleID string, originalDate civil.Date, in schedule.SlotInput) (schedule.Detail, error)
	Cancel(ctx context.Context, scheduleID, reason string) (schedule.Cancel, error)
	Update(ctx context.Context, scheduleID string, in schedule.SlotInput) (schedule.Detail, error)
}
