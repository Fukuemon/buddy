// Package calendar は、職員が結び付けた外部のカレンダー（Google カレンダー）と buddy の予定を、取り込み、書き出し、同期でつなぐ。
// 結び付けたカレンダーと予定の対応と、外部の予定と buddy の予定を互いに読み替える規則を持つ。
// 取り込みと同期は外部の予定から buddy の予定を作るか変え、書き出し（Outbox と Exporter）は buddy の予定の変更を外部のカレンダーに書く。
package calendar

import (
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
)

// ProviderGoogle は、Google カレンダーの ExternalCalendar.Provider である。
const ProviderGoogle = "google"

// ExternalCalendar は、職員に結び付けた外部のカレンダーである。外したカレンダーは DisabledAt を持つ。
type ExternalCalendar struct {
	ID         string
	FacilityID string
	StaffID    string
	Provider   string
	// CalendarID は、外部のカレンダーの ID である。Google カレンダーでは、職員のメールアドレスのことがある。
	CalendarID string
	DisabledAt *time.Time
	CreatedAt  time.Time
	UpdatedAt  time.Time
	// LastImport は、最も新しく始めた取り込みで、取り込んだことが無ければ nil である。一覧のときだけ持つ。
	LastImport *ImportRun
}

// RunStatus は、取り込みの状態である。
type RunStatus string

// RunStatus の値。
const (
	RunRunning   RunStatus = "running"
	RunSucceeded RunStatus = "succeeded"
	RunFailed    RunStatus = "failed"
)

// ImportRun は、1 回の取り込みの記録である。
type ImportRun struct {
	ID                 string
	FacilityID         string
	ExternalCalendarID string
	RequestedBy        string
	RangeStart         civil.Date
	RangeEnd           civil.Date
	Status             RunStatus
	ImportedCount      int
	SkippedCount       int
	StartedAt          time.Time
	FinishedAt         *time.Time
}

// EventLink は、取り込んだ外部の予定と、buddy の単発か繰り返しの予定の対応である。ScheduleID と RecurringScheduleID のどちらか 1 つを持つ。
type EventLink struct {
	ID                 string
	FacilityID         string
	ExternalCalendarID string
	ExternalEventID    string
	RecurringEventID   *string
	ETag               string
	// SyncedVersion は、最後に外部の予定と同じにした時点の、buddy の予定の更新の番号である。更新の番号を持つ前に書いた対応では nil である。
	SyncedVersion       *int
	ScheduleID          *string
	RecurringScheduleID *string
}
