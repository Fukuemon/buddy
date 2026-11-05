package schedule

import (
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/visit"
)

// Frequency は、繰り返しの単位である。
type Frequency string

// Frequency の値。
const (
	Weekly  Frequency = "weekly"
	Monthly Frequency = "monthly"
)

// Rule は、繰り返しの規則である。DayOfWeek は 1 が月曜、7 が日曜である。
// 指定しない項目は nil で、そのときは繰り返しの予定の最初の日付から決める。EndDate はその日を含む。
type Rule struct {
	Frequency   Frequency
	DayOfWeek   *int
	DayOfMonth  *int
	WeekOfMonth *int
	EndDate     *civil.Date
}

// NewRule は、頻度ごとに使える項目の組み合わせと値の範囲を検証して Rule を作る。
// 毎週は DayOfWeek だけを、毎月は DayOfMonth だけか、WeekOfMonth と DayOfWeek の組を受け付ける。
func NewRule(r Rule) (Rule, error) {
	if err := validateRange("曜日", r.DayOfWeek, 1, 7); err != nil {
		return Rule{}, err
	}
	if err := validateRange("日", r.DayOfMonth, 1, 31); err != nil {
		return Rule{}, err
	}
	if err := validateRange("週", r.WeekOfMonth, 1, 5); err != nil {
		return Rule{}, err
	}
	switch r.Frequency {
	case Weekly:
		if r.DayOfMonth != nil || r.WeekOfMonth != nil {
			return Rule{}, apperr.Invalid("毎週の繰り返しには曜日だけを指定できます")
		}
	case Monthly:
		if r.DayOfMonth != nil && (r.DayOfWeek != nil || r.WeekOfMonth != nil) {
			return Rule{}, apperr.Invalid("毎月の繰り返しには、日か、週と曜日の組のどちらかを指定します")
		}
		if (r.WeekOfMonth == nil) != (r.DayOfWeek == nil) {
			return Rule{}, apperr.Invalid("毎月の繰り返しの週と曜日は組で指定します")
		}
	default:
		return Rule{}, apperr.Invalid("繰り返しの頻度は %s か %s です", Weekly, Monthly)
	}
	return r, nil
}

func validateRange(label string, v *int, lo, hi int) error {
	if v != nil && (*v < lo || *v > hi) {
		return apperr.Invalid("%sは%dから%dの値です", label, lo, hi)
	}
	return nil
}

// isoWeekday は、月曜を 1、日曜を 7 とする曜日を返す。
func isoWeekday(d civil.Date) int {
	if w := d.Weekday(); w != time.Sunday {
		return int(w)
	}
	return 7
}

// RecurringSchedule は、繰り返しの予定である。Slot.Date は最初の回の日付である。
type RecurringSchedule struct {
	ID string
	Slot
	Rule Rule
}

// NewRecurring は、予定の項目と、終了日が最初の日付より前でないことと、最初の日付が規則の回に当たることを
// 検証して RecurringSchedule を作る。最初の日付が回に当たらないと、Slot.Date の回を置き換えられない。
func NewRecurring(id string, s Slot, typ Type, rule Rule) (RecurringSchedule, error) {
	slot, err := newSlot(s, typ)
	if err != nil {
		return RecurringSchedule{}, err
	}
	if rule.EndDate != nil && rule.EndDate.Before(slot.Date) {
		return RecurringSchedule{}, apperr.Invalid("繰り返しの終了日は最初の日付以降にします")
	}
	rs := RecurringSchedule{ID: id, Slot: slot, Rule: rule}
	if !rs.HasOccurrenceOn(slot.Date) {
		return RecurringSchedule{}, apperr.Invalid("最初の日付 %s が繰り返しの規則の回に当たりません", slot.Date)
	}
	return rs, nil
}

// HasOccurrenceOn は、d が繰り返しの回に当たるかを返す。除外した日付は考えない。
// 毎月の DayOfMonth がない月（例は 31 日と 2 月）には回がない。
func (rs RecurringSchedule) HasOccurrenceOn(d civil.Date) bool {
	if d.Before(rs.Date) {
		return false
	}
	if rs.Rule.EndDate != nil && d.After(*rs.Rule.EndDate) {
		return false
	}
	weekday := isoWeekday(rs.Date)
	if rs.Rule.DayOfWeek != nil {
		weekday = *rs.Rule.DayOfWeek
	}
	switch rs.Rule.Frequency {
	case Weekly:
		return isoWeekday(d) == weekday
	case Monthly:
		switch {
		case rs.Rule.DayOfMonth != nil:
			return d.Day == *rs.Rule.DayOfMonth
		case rs.Rule.WeekOfMonth != nil:
			return isoWeekday(d) == weekday && (d.Day-1)/7+1 == *rs.Rule.WeekOfMonth
		default:
			return d.Day == rs.Date.Day
		}
	}
	return false
}

// StoredRecurring は、保存した繰り返しの予定を、予定を書く前の確認に使う値と読んだものである。名前を結合しない（ADR-0030）。
// Visit は訪問の情報で、訪問の予定でなければ nil である。
// Version は更新の番号で、作ったときに 1 で、回を除外するたびに 1 つ増える。
type StoredRecurring struct {
	RecurringSchedule
	Visit   *visit.Info
	Version int
}
