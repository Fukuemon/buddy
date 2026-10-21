package calendar

import (
	"errors"
	"fmt"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/Fukuemon/buddy/apps/schedule-api/internal/civil"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/schedule"
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

// RuleFromRecurrence は、親の繰り返しの予定の recurrence の行を、buddy の繰り返しの規則と除外する日に写す。
// first と start は、最初の回の日付と開始の時刻（Asia/Tokyo）で、UNTIL と COUNT から終了日を決めるのに使う。
//
// 写せるのは、間隔が 1 の FREQ=WEEKLY で BYDAY が 1 つか無いもの、FREQ=MONTHLY で BYMONTHDAY が 1 つのもの、
// FREQ=MONTHLY で BYDAY が 1〜5 の週の曜日 1 つのもの、BY の無い FREQ=MONTHLY だけである。
// UNTIL はその時刻までに始まる最後の回の日付を、COUNT は最後の回の日付を終了日にする。EXDATE は Asia/Tokyo の日付にする。
// ほかの形（隔週、複数の曜日、最終週、RDATE、ほかの FREQ）、最初の日付が回に当たらない規則、回の無い規則、
// 読めない行では、ErrNeedsExpansion を包んだエラーを返す。
func RuleFromRecurrence(lines []string, first civil.Date, start civil.Time) (Recurrence, error) {
	var (
		rrule string
		rules int
		out   Recurrence
	)
	for _, line := range lines {
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
	rs := schedule.RecurringSchedule{Slot: schedule.Slot{Date: first}, Rule: rule}
	if !rs.Occurs(first) {
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
	slices.SortFunc(out.ExclusionDates, func(a, b civil.Date) int { return a.Time().Compare(b.Time()) })
	out.ExclusionDates = slices.Compact(out.ExclusionDates)
	return out, nil
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
		parts[strings.ToUpper(k)] = strings.ToUpper(v)
	}
	for k, v := range parts {
		switch k {
		case "FREQ", "BYDAY", "BYMONTHDAY", "UNTIL", "COUNT", "WKST":
		case "INTERVAL":
			if v != "1" {
				return schedule.Rule{}, "", 0, expansion("INTERVAL=%s は写せない", v)
			}
		default:
			return schedule.Rule{}, "", 0, expansion("%s は写せない", k)
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
		rule.Frequency = schedule.Weekly
		if bymonthday != "" {
			return schedule.Rule{}, "", 0, expansion("毎週の BYMONTHDAY は写せない")
		}
		if byday != "" {
			dow, ok := weekdays[byday]
			if !ok {
				return schedule.Rule{}, "", 0, expansion("毎週の BYDAY=%s は写せない", byday)
			}
			rule.DayOfWeek = &dow
		}
	case "MONTHLY":
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

// untilDate は、UNTIL の時刻までに start に始まる最後の回の日付を返す。
// UNTIL は、日付、UTC の日時、タイムゾーンの無い日時（Asia/Tokyo として読む）のどれかである。
// 出典: https://datatracker.ietf.org/doc/html/rfc5545#section-3.3.10
func untilDate(until string, start civil.Time) (civil.Date, error) {
	if d, err := time.ParseInLocation("20060102", until, tokyo); err == nil {
		return civil.DateOf(d), nil
	}
	u, err := parseDateTime(until, tokyo)
	if err != nil {
		return civil.Date{}, expansion("UNTIL=%s を読めない", until)
	}
	u = u.In(tokyo)
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
		if rs.Occurs(d) {
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
// params の TZID はタイムゾーンの無い日時のタイムゾーンで、無ければ Asia/Tokyo とする。
func parseDates(params, value string) ([]civil.Date, error) {
	loc := tokyo
	for _, p := range strings.Split(params, ";") {
		if tz, ok := strings.CutPrefix(p, "TZID="); ok {
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
		dates = append(dates, civil.DateOf(t.In(tokyo)))
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
