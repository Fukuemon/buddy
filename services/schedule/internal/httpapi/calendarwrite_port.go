package httpapi

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/features/schedule"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/scheduleview"
)

// CalendarWriteApp は、google_primary の事業所で、予定のハンドラが Google カレンダーに予定を書く操作である（ADR-0026）。
// 組み立ての場所が、calendarwrite の操作の型の Do を入れる。入れていない操作を呼ぶと panic する（ADR-0021）。
type CalendarWriteApp struct {
	// Create は、画面が決めた ID が id の単発の予定を Google カレンダーに書き、書いた予定を返す。
	Create func(ctx context.Context, facilityID, id string, in schedule.SlotInput) (scheduleview.Detail, error)
}
