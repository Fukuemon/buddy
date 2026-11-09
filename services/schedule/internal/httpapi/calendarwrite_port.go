package httpapi

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/schedule"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/scheduleview"
)

// CalendarWriteApp は、google_primary の事業所で、予定のハンドラが Google カレンダーに予定を書く操作である（ADR-0029）。
// 組み立ての場所が、calendarwrite の操作の型の Do を入れる。入れていない操作を呼ぶと panic する（ADR-0024）。
type CalendarWriteApp struct {
	// Create は、画面が決めた ID が id の単発の予定を Google カレンダーに書き、書いた予定を返す。
	Create func(ctx context.Context, facilityID, id string, in schedule.SlotInput) (scheduleview.Detail, error)
	// Update は、一覧での ID が id の単発の予定を、画面が読んだ etag を If-Match に付けて Google カレンダーに書き、書いた予定を返す。
	Update func(ctx context.Context, facilityID, id, etag string, in schedule.SlotInput) (scheduleview.Detail, error)
	// Cancel は、一覧での ID が id の単発の予定を、画面が読んだ etag を If-Match に付けて Google カレンダーから消す。
	Cancel func(ctx context.Context, facilityID, id, etag, reason string) (schedule.Cancellation, error)
	// CreateRecurring は、画面が決めた ID が id の繰り返しの予定を Google カレンダーの 1 つの繰り返しの予定として書き、書いた予定を返す。
	CreateRecurring func(ctx context.Context, facilityID, id string, in schedule.SlotInput, rule schedule.RuleInput) (scheduleview.RecurringDetail, error)
	// ChangeOccurrence は、繰り返しの予定 recurringScheduleID の originalDate の回を、Google カレンダーの例外の回にして変え、変えた回を返す。
	ChangeOccurrence func(ctx context.Context, facilityID, recurringScheduleID string, originalDate civil.Date, in schedule.SlotInput) (scheduleview.Detail, error)
	// ChangeRule は、繰り返しの予定 recurringScheduleID の規則を、適用の日以降の回について変え、適用の日以降の回を持つ繰り返しの予定を返す（ADR-0037）。
	// id は分けたときの新しい繰り返しの予定の ID で、etag は画面が読んだ親の予定の etag である。
	// firstWeek は新しい規則の 1 週目を決める日で、nil なら effective を使う（ADR-0038）。
	ChangeRule func(ctx context.Context, facilityID, recurringScheduleID, id, etag string, effective, firstWeek *civil.Date, rule schedule.RuleInput) (scheduleview.RecurringDetail, error)
}
