package scheduleview

import (
	"context"
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/schedule"
)

// EventKind は、Google カレンダーの予定を、buddy の予定の何に読み替えたかである。
type EventKind int

// EventKind の値。
const (
	// EventSkipped の予定は、buddy の予定に読み替えず、一覧に出さない。終日の予定、日をまたぐ予定、時刻を読めない予定、
	// 長さが 0 以下の予定である。取り込みが取り込まない予定と同じである。
	EventSkipped EventKind = iota
	// EventVisit の予定は、タイトルからサービス内容と利用者名を読めた訪問の予定である。
	EventVisit
	// EventNormal の予定は、タイトルを buddy の予定のタイトルにした通常の予定である。
	EventNormal
	// EventUnreadableTitle の予定は、日時を読めたが、タイトルが空白だけか、訪問のタイトルを読めない予定である。
	EventUnreadableTitle
)

// EventReading は、Google カレンダーの 1 つの予定を、取り込みと同じ規則で buddy の予定に読み替えた結果である。
type EventReading struct {
	Kind EventKind
	// Date、StartTime、EndTime は、Asia/Tokyo での日付と時刻である。EndsNextDay は、Date の翌日の EndTime に終わる予定のときに true である。
	Date        civil.Date
	StartTime   civil.Time
	EndTime     civil.Time
	EndsNextDay bool
	// Title は、Google のタイトルを buddy の予定のタイトルの長さに切ったものである。
	Title string
	// ServiceKey と ClientKey は、訪問の予定のタイトルから読んだサービス内容と利用者名を、EventRules の ServiceKey と ClientKey と
	// 同じ規則で表記をそろえた値である。訪問の予定でなければ空である。
	ServiceKey string
	ClientKey  string
}

// EventRules は、Projection の予定を buddy の予定に読み替える規則である。取り込みと同じ規則を使うため、実装は calendar.ProjectionRules である。
type EventRules interface {
	// Read は、確定の予定 p を読み替える。繰り返しの親の予定では、最初の回を読み替える。
	Read(p Projection) EventReading
	// Recurrence は、繰り返しの親の予定 p の繰り返しを、buddy の繰り返しの規則と除外する日に写す。写せないときはエラーを返す。
	Recurrence(p Projection) (schedule.Rule, []civil.Date, error)
	// ServiceKey は、サービスコードの表記を、EventReading.ServiceKey と比べられる値にする。
	ServiceKey(code string) string
	// ClientKey は、利用者の名前を、EventReading.ClientKey と比べられる値にする。
	ClientKey(name string) string
}

// SyncStatus は、カレンダーの最後の同期の結果である。値は calendarsync.SyncStatus と同じである。
type SyncStatus string

// SyncStatus の値。
const (
	SyncNever     SyncStatus = "never"
	SyncSucceeded SyncStatus = "succeeded"
	SyncFailed    SyncStatus = "failed"
)

// CalendarSync は、結び付けたカレンダーの同期の状況である。
type CalendarSync struct {
	ExternalCalendarID string
	StaffID            string
	StaffName          string
	LastStatus         SyncStatus
	// LastSucceededAt は、変わった予定を最後まで読んで写した最後の同期の時刻で、成功したことが無ければ nil である。
	LastSucceededAt *time.Time
	// LastError は、最後の同期の失敗の理由（calendarsync.SyncErrorCode の値）で、最後の同期が失敗でなければ nil である。
	LastError *string
}

// CalendarSyncs は、事業所のカレンダーの同期の状況を読む。実装は postgres.CalendarProjectionRepository である。
type CalendarSyncs interface {
	// ListSyncsByFacility は、事業所の外していないカレンダーの同期の状況を、カレンダーの ID の順に返す。同期の状態の行が無いカレンダーは never にする。
	ListSyncsByFacility(ctx context.Context, facilityID string) ([]CalendarSync, error)
}

// OpenCutover は、事業所の予定の正本を buddy に切り替えている間の、open の切り替えである（ADR-0035）。
type OpenCutover struct {
	StartedAt time.Time
	// RangeStart は、切り替えの取り込みの期間の最初の日である。
	RangeStart civil.Date
}

// Cutovers は、事業所の open の切り替えを読む。実装は postgres.CalendarProjectionRepository である。
type Cutovers interface {
	// FindOpenCutover は、事業所 facilityID の open の切り替えを返す。無ければ nil を返す。
	FindOpenCutover(ctx context.Context, facilityID string) (*OpenCutover, error)
}
