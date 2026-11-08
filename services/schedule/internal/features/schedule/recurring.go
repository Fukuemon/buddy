package schedule

import (
	"slices"
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

// MaxInterval は、毎週の間隔（週の数）の上限である。入力の誤りを拒むために置く（ADR-0038）。
const MaxInterval = 52

// Rule は、繰り返しの規則である。曜日は 1 が月曜、7 が日曜である。
// DaysOfWeek と Interval は毎週だけが持つ。DaysOfWeek は重ならない曜日を月曜から日曜の順に並べ、Interval は 1 が毎週、2 が隔週である。
// DayOfWeek は毎月の WeekOfMonth と組で使う。毎月の規則の Interval は 0 である。
// 指定しない項目は nil で、そのときは繰り返しの予定の最初の日付から決める。EndDate はその日を含む。
type Rule struct {
	Frequency   Frequency
	DaysOfWeek  []int
	Interval    int
	DayOfWeek   *int
	DayOfMonth  *int
	WeekOfMonth *int
	EndDate     *civil.Date
}

// NewRule は、頻度ごとに使える項目の組み合わせと値の範囲を検証して Rule を作る。
// 毎週は DaysOfWeek と Interval だけを、毎月は DayOfMonth だけか、WeekOfMonth と DayOfWeek の組を受け付ける。
// 毎週の DaysOfWeek は月曜から日曜の順に並べ直し、Interval が 0 なら 1 にする。nil の DaysOfWeek は省いた入力で、空の DaysOfWeek は拒む。
// r の DaysOfWeek は変えない。
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
		if r.DayOfMonth != nil || r.WeekOfMonth != nil || r.DayOfWeek != nil {
			return Rule{}, apperr.Invalid("毎週の繰り返しには、曜日の並びと間隔だけを指定できます")
		}
		days, err := weekdaySet(r.DaysOfWeek)
		if err != nil {
			return Rule{}, err
		}
		r.DaysOfWeek = days
		if r.Interval == 0 {
			r.Interval = 1
		}
		if r.Interval < 1 || r.Interval > MaxInterval {
			return Rule{}, apperr.Invalid("毎週の間隔は1から%dの週の数です", MaxInterval)
		}
	case Monthly:
		if r.DaysOfWeek != nil || r.Interval != 0 {
			return Rule{}, apperr.Invalid("毎月の繰り返しには、曜日の並びと間隔を指定できません")
		}
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

// weekdaySet は、曜日の並び days を検証し、月曜から日曜の順に並べたコピーを返す。nil なら nil を返す。
func weekdaySet(days []int) ([]int, error) {
	if days == nil {
		return nil, nil
	}
	if len(days) == 0 {
		return nil, apperr.Invalid("毎週の繰り返しの曜日を1つ以上指定します")
	}
	out := slices.Clone(days)
	slices.Sort(out)
	for i, d := range out {
		if d < 1 || d > 7 {
			return nil, apperr.Invalid("曜日は1から7の値です")
		}
		if i > 0 && out[i-1] == d {
			return nil, apperr.Invalid("毎週の繰り返しの曜日が重なっています")
		}
	}
	return out, nil
}

// WithDays は、毎週の規則 r の曜日の並びが無いときに、first の曜日の 1 つの並びにした規則を返す。毎週でなければ r を返す。
// 曜日を省いた入力と、前の版が曜日の並びを持たずに書いた行の規則を、値で書いた規則と同じに扱うためである。
func (r Rule) WithDays(first civil.Date) Rule {
	if r.Frequency == Weekly && len(r.DaysOfWeek) == 0 {
		r.DaysOfWeek = []int{isoWeekday(first)}
	}
	return r
}

// isoWeekday は、月曜を 1、日曜を 7 とする曜日を返す。
func isoWeekday(d civil.Date) int {
	if w := d.Weekday(); w != time.Sunday {
		return int(w)
	}
	return 7
}

// weekStart は、d を含む日曜に始まる週の、日曜の日付を返す。
func weekStart(d civil.Date) civil.Date {
	return civil.DateOf(d.Time().AddDate(0, 0, -int(d.Weekday())))
}

// weeksBetween は、from を含む日曜に始まる週から、d を含む週までの週の数を返す。
func weeksBetween(from, d civil.Date) int {
	return int(weekStart(d).Time().Sub(weekStart(from).Time()).Hours()) / (24 * 7)
}

// RecurringSchedule は、繰り返しの予定である。Slot.Date は最初の回の日付である。
type RecurringSchedule struct {
	ID string
	Slot
	Rule Rule
}

// NewRecurring は、予定の項目と、終了日が最初の日付より前でないことと、最初の日付が規則の回に当たることを
// 検証して RecurringSchedule を作る。最初の日付が回に当たらないと、Slot.Date の回を置き換えられない。
// 毎週の規則に曜日の並びが無ければ、最初の日付の曜日の 1 つの並びにする。
func NewRecurring(id string, s Slot, typ Type, rule Rule) (RecurringSchedule, error) {
	slot, err := newSlot(s, typ)
	if err != nil {
		return RecurringSchedule{}, err
	}
	if rule.EndDate != nil && rule.EndDate.Before(slot.Date) {
		return RecurringSchedule{}, apperr.Invalid("繰り返しの終了日は最初の日付以降にします")
	}
	rs := RecurringSchedule{ID: id, Slot: slot, Rule: rule.WithDays(slot.Date)}
	if !rs.HasOccurrenceOn(slot.Date) {
		return RecurringSchedule{}, apperr.Invalid("最初の日付 %s が繰り返しの規則の回に当たりません", slot.Date)
	}
	return rs, nil
}

// HasOccurrenceOn は、d が繰り返しの回に当たるかを返す。除外した日付は考えない。
// 毎週の回は、日曜に始まる週で数え、最初の日付を含む週から間隔の倍数だけ後の週の、規則の曜日にある（ADR-0038）。
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
		days := rs.Rule.DaysOfWeek
		if len(days) == 0 {
			days = []int{weekday}
		}
		if !slices.Contains(days, isoWeekday(d)) {
			return false
		}
		return weeksBetween(rs.Date, d)%max(rs.Rule.Interval, 1) == 0
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

// StoredRecurring は、保存した繰り返しの予定を、予定を書く前の確認に使う値と読んだものである。名前を結合しない（ADR-0026）。
// Visit は訪問の情報で、訪問の予定でなければ nil である。
// Version は更新の番号で、作ったときに 1 で、回を除外するたびに 1 つ増える。
type StoredRecurring struct {
	RecurringSchedule
	Visit   *visit.Info
	Version int
}
