package calendar

import (
	"encoding/base32"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/oklog/ulid/v2"

	"github.com/Fukuemon/buddy/packages/go/gcaltitle"

	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/schedule"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/scheduleview"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/visit"
)

// 外部の予定の extendedProperties.private に置く、buddy の予定の ID のキー。値は ID だけにし、個人の情報を置かない。
const (
	PropScheduleID          = "buddyScheduleId"
	PropRecurringScheduleID = "buddyRecurringScheduleId"
)

// EventBody は、外部のカレンダーに書く予定の内容である。
type EventBody struct {
	Summary string
	// Description は、予定の説明である。nil なら、外部の予定の説明を変えない。取り込んだ予定の説明を消さないためである。
	Description *string
	Start       When
	End         When
	// Recurrence は、繰り返しの予定の RRULE と EXDATE の行である。単発の予定では空である。
	Recurrence []string
	// Private は、extendedProperties.private に置く値である。
	Private map[string]string
}

// EventWriter が返すエラー。書き出しの処理が、待ちの状態に対応させる。
var (
	// ErrEventChanged は、If-Match の etag が外部の予定と違ったこと（412）を表す。
	ErrEventChanged = errors.New("外部のカレンダーで予定が変わっていました")
	// ErrEventGone は、外部の予定が消されていること（410 か、消された予定への 412）を表す。
	ErrEventGone = errors.New("外部のカレンダーで予定が消されています")
	// ErrEventNotFound は、外部が予定かカレンダーを見つけられないこと（404）を表す。予定が消されたのか、
	// カレンダーの共有が外れたのかを見分けられない。
	ErrEventNotFound = errors.New("外部のカレンダーで予定かカレンダーが見つかりません")
	// ErrEventRejected は、外部が予定の内容を受け付けなかったこと（400）を表す。
	ErrEventRejected = errors.New("外部のカレンダーが予定の内容を受け付けませんでした")
	// ErrEventExists は、作ろうとした ID の予定が、消したものを含めて外部のカレンダーにあることを表す。
	ErrEventExists = errors.New("外部のカレンダーに同じ ID の予定があります")
	// ErrUnwritable は、サービスアカウントがカレンダーに予定を書けないことを表す。
	ErrUnwritable = errors.New("カレンダーに予定を書けません。予定の変更の権限で共有されているかを確認してください")
)

var eventIDEncoding = base32.HexEncoding.WithPadding(base32.NoPadding)

// EventIDOf は、buddy の予定の ID（ULID）から、外部の予定の ID を決める。Google カレンダーの予定の ID は、
// base32hex の文字（a〜v と 0〜9）で 5〜1024 文字なので、ULID の 128 ビットを base32hex の小文字にする。
// 同じ予定からは同じ ID になるので、作った後に対応を書けずに作り直しても、予定は 2 つにならない。
//
// 出典: https://developers.google.com/workspace/calendar/api/v3/reference/events
func EventIDOf(id string) (string, error) {
	u, err := ulid.ParseStrict(id)
	if err != nil {
		return "", fmt.Errorf("ULID でない ID %q: %w", id, err)
	}
	return strings.ToLower(eventIDEncoding.EncodeToString(u[:])), nil
}

// ScheduleBody は、単発の予定 d を外部の予定の内容にする。
func ScheduleBody(d scheduleview.Detail) EventBody {
	return EventBody{
		Summary:     summary(d.Visit, d.Title),
		Description: d.Description,
		Start:       whenOf(d.Date, d.StartTime),
		End:         whenOf(endDate(d.Slot), d.EndTime),
		Private:     map[string]string{PropScheduleID: d.ID},
	}
}

// RecurringBody は、繰り返しの予定 rs を、exdates の日を除いた外部の繰り返しの予定の内容にする。
func RecurringBody(rs scheduleview.RecurringDetail, exdates []civil.Date) EventBody {
	return EventBody{
		Summary:     summary(rs.Visit, rs.Title),
		Description: rs.Description,
		Start:       whenOf(rs.Date, rs.StartTime),
		End:         whenOf(endDate(rs.Slot), rs.EndTime),
		Recurrence:  RecurrenceOf(rs.RecurringSchedule, exdates),
		Private:     map[string]string{PropRecurringScheduleID: rs.ID},
	}
}

// summary は、訪問の予定なら照合の API が読む `【サービス内容】利用者名` を、通常の予定ならタイトルを返す。
func summary(v *visit.Detail, title *string) string {
	if v != nil {
		return gcaltitle.Format(v.ServiceCode, v.PatientName)
	}
	if title != nil {
		return *title
	}
	return ""
}

// endDate は、予定の枠 s の終わる日を返す。終了が翌日の予定は、予定の日付の翌日に終わる（ADR-0011）。
// 繰り返しの予定では、最初の回の終わる日である。
func endDate(s schedule.Slot) civil.Date {
	if s.EndsNextDay {
		return civil.DateOf(s.Date.Time().AddDate(0, 0, 1))
	}
	return s.Date
}

// whenOf は、Asia/Tokyo の日付と時刻を、オフセットの無い日時とタイムゾーンの名前にする。
func whenOf(d civil.Date, t civil.Time) When {
	return When{DateTime: fmt.Sprintf("%sT%02d:%02d:00", d, t.Hour, t.Minute), TimeZone: TimeZone}
}

var weekdayCodes = [...]string{1: "MO", 2: "TU", 3: "WE", 4: "TH", 5: "FR", 6: "SA", 7: "SU"}

// RecurrenceOf は、繰り返しの予定 rs の規則と、exdates の日を、RRULE と EXDATE の行にする。RuleFromRecurrence の逆で、
// buddy の規則は全て RRULE に写せる。規則に値が無い項目は、最初の回の日付から決めて書く。
// 終了日は、その日の 23:59:59（Asia/Tokyo）を UTC にした UNTIL にする。開始にタイムゾーンを付けた予定の UNTIL は UTC で書くためである。
//
// 出典: https://datatracker.ietf.org/doc/html/rfc5545#section-3.3.10
func RecurrenceOf(rs schedule.RecurringSchedule, exdates []civil.Date) []string {
	r := rs.Rule
	dow := isoWeekday(rs.Date)
	if r.DayOfWeek != nil {
		dow = *r.DayOfWeek
	}
	var rule string
	switch {
	case r.Frequency == schedule.Weekly:
		rule = "FREQ=WEEKLY;BYDAY=" + weekdayCodes[dow]
	case r.WeekOfMonth != nil:
		rule = fmt.Sprintf("FREQ=MONTHLY;BYDAY=%d%s", *r.WeekOfMonth, weekdayCodes[dow])
	default:
		day := rs.Date.Day
		if r.DayOfMonth != nil {
			day = *r.DayOfMonth
		}
		rule = fmt.Sprintf("FREQ=MONTHLY;BYMONTHDAY=%d", day)
	}
	if r.EndDate != nil {
		end := time.Date(r.EndDate.Year, r.EndDate.Month, r.EndDate.Day, 23, 59, 59, 0, Tokyo).UTC()
		rule += ";UNTIL=" + end.Format("20060102T150405Z")
	}
	lines := []string{"RRULE:" + rule}
	if len(exdates) > 0 {
		dates := sortedUniqueDates(exdates)
		values := make([]string, len(dates))
		for i, d := range dates {
			values[i] = fmt.Sprintf("%04d%02d%02dT%02d%02d00", d.Year, d.Month, d.Day, rs.StartTime.Hour, rs.StartTime.Minute)
		}
		lines = append(lines, "EXDATE;TZID="+TimeZone+":"+strings.Join(values, ","))
	}
	return lines
}

// isoWeekday は、月曜を 1、日曜を 7 とする曜日を返す。
func isoWeekday(d civil.Date) int {
	if w := d.Weekday(); w != time.Sunday {
		return int(w)
	}
	return 7
}
