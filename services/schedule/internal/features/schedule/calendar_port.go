package schedule

import "context"

// Exports は、予定の変更を、外部のカレンダーへの書き出しの待ちに積む。実装は calendarexport.Outbox である。
// 予定の職員が外部のカレンダーを結び付けておらず、予定に外部の予定の対応も無ければ、積まずに nil を返す。
// 予定の変更と同じトランザクションの中で呼ぶ。
type Exports interface {
	ScheduleChanged(ctx context.Context, facilityID, staffID, scheduleID string) error
	RecurringChanged(ctx context.Context, facilityID, staffID, recurringScheduleID string) error
	// ScheduleDeleted は、削除した単発の予定 scheduleID の外部の予定を消す待ちを積む。予定の行を消した後に呼ぶ（ADR-0040）。
	ScheduleDeleted(ctx context.Context, facilityID, staffID, scheduleID string) error
}
