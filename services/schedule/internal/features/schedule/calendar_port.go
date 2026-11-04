package schedule

import "context"

// Exports は、予定の変更を、外部のカレンダーへの書き出しの待ちに積む。実装は calendarexport.Outbox である。
// 予定の職員が外部のカレンダーを結び付けておらず、予定に外部の予定の対応も無ければ、積まずに nil を返す。
// 予定の変更と同じトランザクションの中で呼ぶ。
type Exports interface {
	ScheduleChanged(ctx context.Context, facilityID, staffID, scheduleID string) error
	RecurringChanged(ctx context.Context, facilityID, staffID, recurringScheduleID string) error
}
