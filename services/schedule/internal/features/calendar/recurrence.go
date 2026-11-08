package calendar

import (
	"errors"
	"fmt"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/schedule"
)

// ErrNeedsExpansion は、繰り返しの予定を buddy の繰り返しの規則に写せず、回に展開して取り込む必要があることを表す。
var ErrNeedsExpansion = errors.New("繰り返しの規則に写せない")

// Recurrence は、buddy の繰り返しの規則と、除外する日である。
type Recurrence struct {
	Rule           schedule.Rule
	ExclusionDates []civil.Date
}

// maxCountDays は、COUNT の最後の回を探す日数の上限である。毎月の 5 週目でも、COUNT が数百までなら届く。
const maxCountDays = 100 * 366

var weekdays = map[string]int{"MO": 1, "TU": 2, "WE": 3, "TH": 4, "FR": 5, "SA": 6, "SU": 7}

// RuleFromRecurrence は、親の繰り返しの予定 parent の Recurrence を、buddy の繰り返しの規則と除外する日に写す。
// parent.Start を最初の回とし、UNTIL と COUNT から終了日を決めるのに使う。
// RRULE は親の予定のタイムゾーンの暦で数えるので、タイムゾーンが Asia/Tokyo でない予定は写さない。
// タイムゾーンは parent.Start.TimeZone で、空なら parent.Start.DateTime のオフセット（+09:00 か）で見る。
//
// 出典: https://datatracker.ietf.org/doc/html/rfc5545#section-3.3.10
//
// 写せるのは、間隔が 1〜52 の FREQ=WEEKLY で BYDAY が数字の無い 1 つ以上の曜日か無いもの、BY の無い間隔が 1 の FREQ=DAILY（7 つの曜日の毎週にする）、
// FREQ=MONTHLY で BYMONTHDAY が 1 つのもの、FREQ=MONTHLY で BYDAY が 1〜5 の週の曜日 1 つのもの、BY の無い FREQ=MONTHLY だけである（ADR-0039）。
// 間隔が 2 以上で曜日が複数の毎週は、WKST の週の区切りが buddy の日曜に始まる週と同じ曜日の組を作るときだけ写す（weekStartMatches）。
// UNTIL はその時刻までに始まる最後の回の日付を、COUNT は最後の回の日付を終了日にする。EXDATE は Asia/Tokyo の日付にする。
// ほかの形（最終週、BYSETPOS、RDATE、間隔が 2 以上の毎日、毎月の間隔、ほかの FREQ）、最初の日付が回に当たらない規則、回の無い規則、
// 終日か開始の日時を読めない予定、読めない行では、ErrNeedsExpansion を包んだエラーを返す。
func RuleFromRecurrence(parent Event) (Recurrence, error) {
	first, start, err := tokyoStart(parent.Start)
	if err != nil {
		return Recurrence{}, err
	}
	var (
		rrule string
		rules int
		out   Recurrence
	)
	for _, line := range parent.Recurrence {
		head, value, ok := strings.Cut(line, ":")
		if !ok {
			return Recurrence{}, expansion("行の形が違う: %q", line)
		}
		name, params, _ := strings.Cut(head, ";")
		switch strings.ToUpper(name) {
		case "RRULE":
			rrule = value
			rules++
		case "EXDATE":
			dates, err := parseDates(params, value)
			if err != nil {
				return Recurrence{}, err
			}
			out.ExclusionDates = append(out.ExclusionDates, dates...)
		default:
			return Recurrence{}, expansion("%s は写せない", name)
		}
	}
	if rules != 1 {
		return Recurrence{}, expansion("RRULE が %d 行ある", rules)
	}
	rule, until, count, err := parseRRule(rrule)
	if err != nil {
		return Recurrence{}, err
	}
	rule, err = schedule.NewRule(rule)
	if err != nil {
		return Recurrence{}, expansion("%v", err)
	}
	rule = rule.WithDays(first)
	rs := schedule.RecurringSchedule{Slot: schedule.Slot{Date: first}, Rule: rule}
	if !rs.HasOccurrenceOn(first) {
		return Recurrence{}, expansion("最初の日付 %s が規則の回に当たらない", first)
	}
	switch {
	case until != "":
		end, err := untilDate(until, start)
		if err != nil {
			return Recurrence{}, err
		}
		if end.Before(first) {
			return Recurrence{}, expansion("UNTIL %s までに回が無い", until)
		}
		rule.EndDate = &end
	case count > 0:
		end, ok := lastOccurrence(rs, count)
		if !ok {
			return Recurrence{}, expansion("COUNT=%d の最後の回が遠すぎる", count)
		}
		rule.EndDate = &end
	}
	out.Rule = rule
	out.ExclusionDates = sortedUniqueDates(out.ExclusionDates)
	return out, nil
}

// sortedUniqueDates は、dates を日付の順に並べて重なりを除いたコピーを返す。dates は変えない。
func sortedUniqueDates(dates []civil.Date) []civil.Date {
	out := slices.Clone(dates)
	slices.SortFunc(out, func(a, b civil.Date) int { return a.Time().Compare(b.Time()) })
	return slices.Compact(out)
}

// tokyoStart は、w が Asia/Tokyo の日時なら、その日付と時刻を返す。
func tokyoStart(w When) (civil.Date, civil.Time, error) {
	t, err := w.Instant()
	if err != nil {
		return civil.Date{}, civil.Time{}, expansion("開始の日時 %q を読めない", w.DateTime)
	}
	if w.TimeZone != "" && w.TimeZone != TimeZone {
		return civil.Date{}, civil.Time{}, expansion("タイムゾーン %s の予定は写せない", w.TimeZone)
	}
	if _, offset := t.Zone(); w.TimeZone == "" && offset != 9*60*60 {
		return civil.Date{}, civil.Time{}, expansion("開始の日時 %s のオフセットが +09:00 でない", w.DateTime)
	}
	t = t.In(Tokyo)
	return civil.DateOf(t), clockOf(t), nil
}

func expansion(format string, args ...any) error {
	return fmt.Errorf("%w: %s", ErrNeedsExpansion, fmt.Sprintf(format, args...))
}

// parseRRule は、RRULE の値を規則と、UNTIL の値と、COUNT に分ける。
func parseRRule(value string) (rule schedule.Rule, until string, count int, err error) {
	parts := map[string]string{}
	for _, p := range strings.Split(value, ";") {
		k, v, ok := strings.Cut(p, "=")
		if !ok {
			return schedule.Rule{}, "", 0, expansion("RRULE の形が違う: %q", value)
		}
		k = strings.ToUpper(k)
		if _, dup := parts[k]; dup {
			return schedule.Rule{}, "", 0, expansion("RRULE の %s が 2 回ある", k)
		}
		parts[k] = strings.ToUpper(v)
	}
	for k := range parts {
		switch k {
		case "FREQ", "BYDAY", "BYMONTHDAY", "UNTIL", "COUNT", "WKST", "INTERVAL":
		default:
			return schedule.Rule{}, "", 0, expansion("%s は写せない", k)
		}
	}
	interval := 1
	if v, ok := parts["INTERVAL"]; ok {
		interval, err = strconv.Atoi(v)
		if err != nil || interval < 1 {
			return schedule.Rule{}, "", 0, expansion("INTERVAL=%s を読めない", v)
		}
	}
	if parts["UNTIL"] != "" && parts["COUNT"] != "" {
		return schedule.Rule{}, "", 0, expansion("UNTIL と COUNT の両方がある")
	}
	if c := parts["COUNT"]; c != "" {
		count, err = strconv.Atoi(c)
		if err != nil || count < 1 {
			return schedule.Rule{}, "", 0, expansion("COUNT=%s を読めない", c)
		}
	}
	byday, bymonthday := parts["BYDAY"], parts["BYMONTHDAY"]
	switch parts["FREQ"] {
	case "WEEKLY":
		rule.Frequency, rule.Interval = schedule.Weekly, interval
		if bymonthday != "" {
			return schedule.Rule{}, "", 0, expansion("毎週の BYMONTHDAY は写せない")
		}
		if byday != "" {
			for _, code := range strings.Split(byday, ",") {
				dow, ok := weekdays[code]
				if !ok {
					return schedule.Rule{}, "", 0, expansion("毎週の BYDAY=%s は写せない", byday)
				}
				rule.DaysOfWeek = append(rule.DaysOfWeek, dow)
			}
		}
		if !weekStartMatches(parts["WKST"], interval, rule.DaysOfWeek) {
			return schedule.Rule{}, "", 0, expansion("WKST=%s の INTERVAL=%d;BYDAY=%s は写せない", parts["WKST"], interval, byday)
		}
	case "DAILY":
		if interval != 1 || byday != "" || bymonthday != "" {
			return schedule.Rule{}, "", 0, expansion("間隔が 1 でないか BY の付く毎日は写せない")
		}
		// 毎日は、7 つの曜日の毎週にする（ADR-0039）
		rule.Frequency, rule.Interval, rule.DaysOfWeek = schedule.Weekly, 1, []int{1, 2, 3, 4, 5, 6, 7}
	case "MONTHLY":
		if interval != 1 {
			return schedule.Rule{}, "", 0, expansion("毎月の INTERVAL=%d は写せない", interval)
		}
		rule.Frequency = schedule.Monthly
		switch {
		case byday != "" && bymonthday != "":
			return schedule.Rule{}, "", 0, expansion("BYDAY と BYMONTHDAY の両方がある")
		case bymonthday != "":
			day, err := strconv.Atoi(bymonthday)
			if err != nil || day < 1 || day > 31 {
				return schedule.Rule{}, "", 0, expansion("BYMONTHDAY=%s は写せない", bymonthday)
			}
			rule.DayOfMonth = &day
		case byday != "":
			n, wd := strings.TrimPrefix(byday[:max(len(byday)-2, 0)], "+"), byday[max(len(byday)-2, 0):]
			week, err := strconv.Atoi(n)
			dow, ok := weekdays[wd]
			if err != nil || !ok || week < 1 || week > 5 {
				return schedule.Rule{}, "", 0, expansion("毎月の BYDAY=%s は写せない", byday)
			}
			rule.WeekOfMonth, rule.DayOfWeek = &week, &dow
		}
	default:
		return schedule.Rule{}, "", 0, expansion("FREQ=%s は写せない", parts["FREQ"])
	}
	return rule, parts["UNTIL"], count, nil
}

// weekStartMatches は、週の始まり wkst（空はデフォルトの月曜）で数える間隔 interval の毎週の曜日 days の回が、
// buddy の日曜に始まる週で数える回と同じかを返す（ADR-0039）。
// WKST で回が変わるのは、間隔が 2 以上で曜日が複数のときだけである。月曜に始まる週は日曜だけが前の週に入るので、日曜が無ければ同じ回になる。
//
// 出典: https://datatracker.ietf.org/doc/html/rfc5545#section-3.3.10
func weekStartMatches(wkst string, interval int, days []int) bool {
	if interval == 1 || len(days) <= 1 {
		return true
	}
	switch wkst {
	case "SU":
		return true
	case "", "MO":
		return !slices.Contains(days, 7)
	default:
		return false
	}
}

// untilDate は、UNTIL の時刻までに start に始まる最後の回の日付を返す。
// UNTIL は、日付、UTC の日時、タイムゾーンの無い日時（Asia/Tokyo として読む）のどれかである。
func untilDate(until string, start civil.Time) (civil.Date, error) {
	if d, err := time.ParseInLocation("20060102", until, Tokyo); err == nil {
		return civil.DateOf(d), nil
	}
	u, err := parseDateTime(until, Tokyo)
	if err != nil {
		return civil.Date{}, expansion("UNTIL=%s を読めない", until)
	}
	u = u.In(Tokyo)
	d := civil.DateOf(u)
	if clockOf(u).Before(start) {
		d = civil.DateOf(d.Time().AddDate(0, 0, -1))
	}
	return d, nil
}

// lastOccurrence は、rs の count 回目の日付を返す。maxCountDays の日数のうちに届かなければ false を返す。
func lastOccurrence(rs schedule.RecurringSchedule, count int) (civil.Date, bool) {
	d := rs.Date
	for range maxCountDays {
		if rs.HasOccurrenceOn(d) {
			count--
			if count == 0 {
				return d, true
			}
		}
		d = civil.DateOf(d.Time().AddDate(0, 0, 1))
	}
	return civil.Date{}, false
}

// parseDates は、EXDATE の値（カンマで区切った日付か日時）を、Asia/Tokyo の日付にする。
// params の TZID（名前の大文字と小文字を区別せず、値の引用符を外す）はタイムゾーンの無い日時のタイムゾーンで、
// 無ければ Asia/Tokyo とする。
func parseDates(params, value string) ([]civil.Date, error) {
	loc := Tokyo
	for _, p := range strings.Split(params, ";") {
		if k, tz, ok := strings.Cut(p, "="); ok && strings.EqualFold(k, "TZID") {
			tz = strings.Trim(tz, `"`)
			l, err := time.LoadLocation(tz)
			if err != nil {
				return nil, expansion("EXDATE の TZID=%s を読めない", tz)
			}
			loc = l
		}
	}
	var dates []civil.Date
	for _, v := range strings.Split(value, ",") {
		if d, err := time.ParseInLocation("20060102", v, loc); err == nil {
			dates = append(dates, civil.DateOf(d))
			continue
		}
		t, err := parseDateTime(v, loc)
		if err != nil {
			return nil, expansion("EXDATE の %s を読めない", v)
		}
		dates = append(dates, civil.DateOf(t.In(Tokyo)))
	}
	return dates, nil
}

// parseDateTime は、iCalendar の日時を読む。末尾の Z は UTC を、無ければ loc を表す。
func parseDateTime(v string, loc *time.Location) (time.Time, error) {
	if s, ok := strings.CutSuffix(v, "Z"); ok {
		return time.ParseInLocation("20060102T150405", s, time.UTC)
	}
	return time.ParseInLocation("20060102T150405", v, loc)
}

// OriginalDate は、繰り返しの予定の例外の回 ev が、元の規則で始まるはずだった Asia/Tokyo の日付を返す。
// ev が元の開始（OriginalStart）を持たないか、読めないときは false を返す。
func OriginalDate(ev Event) (civil.Date, bool) {
	if ev.OriginalStart.DateTime != "" {
		t, err := ev.OriginalStart.Instant()
		if err != nil {
			return civil.Date{}, false
		}
		return civil.DateOf(t.In(Tokyo)), true
	}
	d, err := civil.ParseDate(ev.OriginalStart.Date)
	return d, err == nil
}
