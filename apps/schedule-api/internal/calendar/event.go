// Package calendar は、外部のカレンダー（Google カレンダー）の予定を、buddy の予定の候補に読み替える規則を持つ。
// 利用者とサービスコードをマスタで引くことと、予定を保存することは、この規則を使う手順が行う。
package calendar

import (
	"context"
	"time"
	_ "time/tzdata" // 配布のイメージ（distroless）にタイムゾーンのデータが無くても Asia/Tokyo を読むため。
)

// TimeZone は、予定の日付と時刻を決めるタイムゾーンである。照合の API と同じにする。
const TimeZone = "Asia/Tokyo"

var tokyo = mustLoadLocation(TimeZone)

func mustLoadLocation(name string) *time.Location {
	loc, err := time.LoadLocation(name)
	if err != nil {
		panic(err)
	}
	return loc
}

// StatusCancelled は、取り消された予定の Event.Status である。繰り返しの予定の取り消した回もこの値になる。
const StatusCancelled = "cancelled"

// When は、予定の開始か終了である。終日の予定は Date だけを、時刻のある予定は DateTime だけを持つ。
type When struct {
	// Date は、終日の予定の日付で、YYYY-MM-DD の形である。
	Date string
	// DateTime は、時刻のある予定の日時で、RFC 3339 の形である。
	DateTime string
	// TimeZone は、予定に付いた IANA のタイムゾーンの名前で、無ければ空である。繰り返しの規則はこの暦で数える。
	TimeZone string
}

// Event は、外部のカレンダーの 1 つの予定である。繰り返しの予定は、親の予定と、変えるか取り消した回（例外）に分かれて来る。
type Event struct {
	ID      string
	ICalUID string
	// Status は、confirmed、tentative、cancelled のいずれかである。
	Status  string
	Start   When
	End     When
	Summary string
	// Recurrence は、親の繰り返しの予定の RRULE、EXDATE、RDATE の行である。親でない予定では空である。
	Recurrence []string
	// RecurringEventID は、例外の回の親の予定の ID である。例外の回でない予定では空である。
	RecurringEventID string
	// OriginalStart は、例外の回が元の規則で始まるはずだった日時である。
	OriginalStart When
	ETag          string
}

// EventSource は、外部のカレンダーから期間の予定を読む。
type EventSource interface {
	// Events は、calendarID のカレンダーの、timeMin から timeMax までに重なる予定を、
	// 繰り返しの親の予定と例外の回を展開せずに返す。
	Events(ctx context.Context, calendarID string, timeMin, timeMax time.Time) ([]Event, error)
}
