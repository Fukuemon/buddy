package calendarimport

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/schedule"
)

// Recurring は、取り込んだ繰り返しの予定と除外する日を書く。
// AddExclusion は、同じ日付をすでに除外しているときに apperr.ErrConflict を返す。
type Recurring interface {
	Create(ctx context.Context, rs schedule.RecurringSchedule) error
	AddExclusion(ctx context.Context, recurringScheduleID string, d civil.Date) error
}
