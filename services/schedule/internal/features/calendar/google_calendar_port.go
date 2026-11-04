package calendar

import (
	"context"
	"errors"
	"time"
	_ "time/tzdata" // 配布のイメージ（distroless）にタイムゾーンのデータが無くても Asia/Tokyo を読むため。
)

// TimeZone は、予定の日付と時刻を決めるタイムゾーンである。照合の API と同じにする。
const TimeZone = "Asia/Tokyo"

// Tokyo は、TimeZone の場所である。外部の予定の日時を、予定の日付と時刻に直すときに使う。
var Tokyo = mustLoadLocation(TimeZone)

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

// localDateTime は、オフセットの無い日時の形である。予定の TimeZone の暦で読む。
const localDateTime = "2006-01-02T15:04:05"

// Instant は、時刻のある予定の日時を返す。DateTime は RFC 3339 で読み、オフセットが無ければ TimeZone の暦で読む。
// Google は、予定を読むリクエストにタイムゾーンを付けると、オフセットの付いた日時を返す。オフセットの無い日時は、buddy が書いた予定を
// フェイクの API から読むときに当たる。
func (w When) Instant() (time.Time, error) {
	t, err := time.Parse(time.RFC3339, w.DateTime)
	if err == nil || w.TimeZone == "" {
		return t, err
	}
	loc, lerr := time.LoadLocation(w.TimeZone)
	if lerr != nil {
		return time.Time{}, err
	}
	return time.ParseInLocation(localDateTime, w.DateTime, loc)
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

// EventSource が返すエラー。httpapi が状態コードに対応させる。
var (
	// ErrUnreadable は、カレンダーが無いか、サービスアカウントに共有されていないことを表す。
	ErrUnreadable = errors.New("カレンダーを読めません。カレンダーの共有を確認してください")
	// ErrUnavailable は、外部のカレンダーに届かないか、外部のカレンダーがエラーを返したことを表す。
	ErrUnavailable = errors.New("外部のカレンダーから予定を読めませんでした")
	// ErrNotConfigured は、外部のカレンダーを読む認証の情報が設定されていないことを表す。
	ErrNotConfigured = errors.New("外部のカレンダーを読む設定がありません")
	// ErrSyncTokenExpired は、増分の取得に使うトークンが切れたこと（410）を表す。全ての予定を読み直す。
	ErrSyncTokenExpired = errors.New("同期のトークンが切れました")
)

// Changes は、外部のカレンダーの変わった予定と、次の増分の取得に使うトークンである。
type Changes struct {
	Events        []Event
	NextSyncToken string
}

// EventSource は、外部のカレンダーから期間の予定を読む。エラーは ErrUnreadable か ErrUnavailable を包む。
type EventSource interface {
	// Events は、calendarID のカレンダーの、timeMin から timeMax までに重なる予定を、
	// 繰り返しの親の予定と例外の回を展開せずに返す。
	Events(ctx context.Context, calendarID string, timeMin, timeMax time.Time) ([]Event, error)
	// Instances は、繰り返しの親の予定 eventID の、timeMin から timeMax までに重なる回を返す。
	// 変えた回は例外の回の値で返り、取り消した回は返らない。
	Instances(ctx context.Context, calendarID, eventID string, timeMin, timeMax time.Time) ([]Event, error)
	// Check は、calendarID のカレンダーの予定を読めるかを確認する。
	Check(ctx context.Context, calendarID string) error
	// Changes は、calendarID のカレンダーの、syncToken を受け取った後に変わった予定を、消した予定と繰り返しの例外の回を含めて、
	// 繰り返しを展開せずに返す。syncToken が空なら、消した予定を含む全ての予定を返す。
	// トークンが切れていれば ErrSyncTokenExpired を包んだエラーを返す。
	Changes(ctx context.Context, calendarID, syncToken string) (Changes, error)
	// Event は、calendarID のカレンダーの予定 eventID を返す。消した予定は、Status が cancelled で返る。
	// 予定かカレンダーが見つからないときは、ErrUnreadable と ErrEventNotFound を包んだエラーを返す。
	Event(ctx context.Context, calendarID, eventID string) (Event, error)
}

// SourceFor は、事業所 facilityID の外部のカレンダーを読む EventSource を返す。
type SourceFor func(ctx context.Context, facilityID string) (EventSource, error)

// WriterFor は、事業所 facilityID の外部のカレンダーに書く EventWriter を返す。
type WriterFor func(ctx context.Context, facilityID string) (EventWriter, error)

// Accounts は、事業所ごとのサービスアカウントで外部のカレンダーを読み書きする手段である（ADR-0012）。
// 事業所にサービスアカウントの設定が無ければ、どのメソッドも ErrNotConfigured を返す。
type Accounts interface {
	// ServiceAccount は、事業所 facilityID の職員がカレンダーを共有する相手のメールアドレスを返す。
	ServiceAccount(ctx context.Context, facilityID string) (string, error)
	// Source は、事業所 facilityID のサービスアカウントで外部のカレンダーを読む EventSource を返す。
	Source(ctx context.Context, facilityID string) (EventSource, error)
	// Writer は、事業所 facilityID のサービスアカウントで外部のカレンダーに書く EventWriter を返す。
	Writer(ctx context.Context, facilityID string) (EventWriter, error)
}

// EventWriter は、外部のカレンダーに予定を書く。エラーは、ErrEventChanged、ErrEventGone、ErrEventNotFound、ErrEventExists、
// ErrEventRejected、ErrUnwritable、ErrUnavailable のいずれかを包む。
type EventWriter interface {
	// Insert は、ID が eventID の予定を作り、etag を返す。
	Insert(ctx context.Context, calendarID, eventID string, b EventBody) (string, error)
	// Update は、予定 eventID を b の内容にし、消されていれば戻して、新しい etag を返す。
	// etag が空でなければ If-Match に付け、外部で予定が変わっていれば ErrEventChanged を、消されていれば ErrEventGone を返す。
	Update(ctx context.Context, calendarID, eventID, etag string, b EventBody) (string, error)
	// Delete は、予定 eventID を消す。etag は Update と同じである。
	Delete(ctx context.Context, calendarID, eventID, etag string) error
}
