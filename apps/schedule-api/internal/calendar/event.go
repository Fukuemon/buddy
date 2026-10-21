// Package calendar は、外部のカレンダー（Google カレンダー）の予定を、buddy の予定の候補に読み替える規則を持つ。
// 利用者とサービスコードをマスタで引くことと、予定を保存することは、この規則を使う手順が行う。
package calendar

import (
	"context"
	"errors"
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

// EventSource が返す誤り。httpapi が状態コードに対応させる。
var (
	// ErrUnreadable は、カレンダーが無いか、サービスアカウントに共有されていないことを表す。
	ErrUnreadable = errors.New("カレンダーを読めません。カレンダーの共有を確かめてください")
	// ErrUnavailable は、外部のカレンダーに届かないか、外部のカレンダーが誤りを返したことを表す。
	ErrUnavailable = errors.New("外部のカレンダーから予定を読めませんでした")
	// ErrNotConfigured は、外部のカレンダーを読む認証の情報が設定されていないことを表す。
	ErrNotConfigured = errors.New("外部のカレンダーを読む設定がありません")
)

// EventSource は、外部のカレンダーから期間の予定を読む。誤りは ErrUnreadable か ErrUnavailable を包む。
type EventSource interface {
	// Events は、calendarID のカレンダーの、timeMin から timeMax までに重なる予定を、
	// 繰り返しの親の予定と例外の回を展開せずに返す。
	Events(ctx context.Context, calendarID string, timeMin, timeMax time.Time) ([]Event, error)
	// Instances は、繰り返しの親の予定 eventID の、timeMin から timeMax までに重なる回を返す。
	// 変えた回は例外の回の値で返り、取り消した回は返らない。
	Instances(ctx context.Context, calendarID, eventID string, timeMin, timeMax time.Time) ([]Event, error)
	// Check は、calendarID のカレンダーの予定を読めるかを確かめる。
	Check(ctx context.Context, calendarID string) error
}
