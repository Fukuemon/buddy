package schedule

import (
	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
)

// RuleChangeKind は、繰り返しの規則の変更を、繰り返しの予定にどう当てるかである（ADR-0037）。
type RuleChangeKind int

// RuleChangeKind の値。
const (
	// RuleChangeEndDate は、終了日だけを変え、繰り返しの予定を分けずに終了日を書き換える。
	RuleChangeEndDate RuleChangeKind = iota + 1
	// RuleChangeInPlace は、適用の日より前の回が無いので、繰り返しの予定を分けずに規則と最初の日付を書き換える。
	RuleChangeInPlace
	// RuleChangeSplit は、元の繰り返しの予定を適用の日の前の日で終え、適用の日以降に新しい繰り返しの予定を作る。
	RuleChangeSplit
)

// maxFirstOccurrenceDays は、新しい規則の最初の回を探す日数である。毎月の 31 日と第 5 週の曜日も、この日数の中に回がある。
const maxFirstOccurrenceDays = 400

// RuleChange は、繰り返しの規則の変更を、今の繰り返しの予定に当てた結果である。
// Kept は、変更の後の元の繰り返しの予定で、RuleChangeSplit のときは終了日を適用の日の前の日にしたものである。
// Next は、適用の日以降の回を持つ繰り返しの予定である。RuleChangeSplit のときは ID と訪問の情報を持たず、呼び出し側が決める。
// ExclusionsFrom は、この日以降の除外する日のうち、置き換えた回の日でない日を消すことを表す。消さないときは nil である。
type RuleChange struct {
	Kind           RuleChangeKind
	Kept           RecurringSchedule
	Next           RecurringSchedule
	ExclusionsFrom *civil.Date
}

// PlanRuleChange は、繰り返しの予定 rs の規則を、effective 以降の回について rule に変える変更を決める（ADR-0037）。
// rule が rs の規則と終了日だけ違うときは、effective を読まない。そのほかのときは effective が必須である。
// today は Asia/Tokyo の今日である。過去の回を変えないため、effective は今日以降に、終了日だけの変更の終了日は今日の前の日以降に限る。
// 入力が規則に合わないときは入力のエラーを返す。
func PlanRuleChange(rs RecurringSchedule, effective *civil.Date, rule Rule, today civil.Date) (RuleChange, error) {
	rule, err := NewRule(rule)
	if err != nil {
		return RuleChange{}, err
	}
	if sameRepetition(rs.Rule, rule) {
		return planEndDateChange(rs, rule.EndDate, today)
	}
	if effective == nil {
		return RuleChange{}, apperr.Invalid("繰り返しの規則を変えるときは、適用の日を指定します")
	}
	if effective.Before(today) {
		return RuleChange{}, apperr.Invalid("適用の日は今日以降にします")
	}
	if rs.Rule.EndDate != nil && effective.After(*rs.Rule.EndDate) {
		return RuleChange{}, apperr.Invalid("適用の日は繰り返しの終了日 %s 以前にします", *rs.Rule.EndDate)
	}
	from := *effective
	kind := RuleChangeSplit
	if !rs.Date.Before(from) {
		// 適用の日より前の回が無い。最初の日付より前には回を作らない
		kind, from = RuleChangeInPlace, rs.Date
	}
	first, ok := firstOccurrence(rs.Slot, rule, from)
	if !ok {
		return RuleChange{}, apperr.Invalid("%s 以降に、新しい繰り返しの規則の回がありません", from)
	}
	slot := rs.Slot
	slot.Date = first
	next := RecurringSchedule{ID: rs.ID, Slot: slot, Rule: rule}
	if kind == RuleChangeInPlace {
		return RuleChange{Kind: kind, Kept: next, Next: next, ExclusionsFrom: &rs.Date}, nil
	}
	kept := rs
	end := addDays(*effective, -1)
	kept.Rule.EndDate = &end
	next.ID = ""
	next.VisitInfoID = nil
	return RuleChange{Kind: kind, Kept: kept, Next: next}, nil
}

// planEndDateChange は、繰り返しの予定 rs の終了日を end に変える変更を決める。end が nil なら終了日を無くす。
// 新しい終了日の後の除外する日のうち、置き換えた回の日でない日を消す。
func planEndDateChange(rs RecurringSchedule, end *civil.Date, today civil.Date) (RuleChange, error) {
	changed := rs
	changed.Rule.EndDate = end
	out := RuleChange{Kind: RuleChangeEndDate, Kept: changed, Next: changed}
	if end == nil {
		return out, nil
	}
	if end.Before(addDays(today, -1)) {
		return RuleChange{}, apperr.Invalid("繰り返しの終了日は今日の前の日以降にします")
	}
	if end.Before(rs.Date) {
		return RuleChange{}, apperr.Invalid("繰り返しの終了日は最初の日付以降にします")
	}
	from := addDays(*end, 1)
	out.ExclusionsFrom = &from
	return out, nil
}

// sameRepetition は、a と b が終了日のほかに同じ規則かを返す。
func sameRepetition(a, b Rule) bool {
	return a.Frequency == b.Frequency && equalInt(a.DayOfWeek, b.DayOfWeek) && equalInt(a.DayOfMonth, b.DayOfMonth) && equalInt(a.WeekOfMonth, b.WeekOfMonth)
}

func equalInt(a, b *int) bool {
	if a == nil || b == nil {
		return a == b
	}
	return *a == *b
}

// firstOccurrence は、from 以降で、slot の時刻の繰り返しの予定が rule で最初に回を持つ日を返す。
// 規則に曜日も日も無いときは、最初の日付から決めるので、from の日を返す。終了日までに回が無ければ false を返す。
func firstOccurrence(slot Slot, rule Rule, from civil.Date) (civil.Date, bool) {
	s := slot
	s.Date = from
	rs := RecurringSchedule{Slot: s, Rule: rule}
	for i := range maxFirstOccurrenceDays {
		d := addDays(from, i)
		if rule.EndDate != nil && d.After(*rule.EndDate) {
			return civil.Date{}, false
		}
		if rs.HasOccurrenceOn(d) {
			return d, true
		}
	}
	return civil.Date{}, false
}

func addDays(d civil.Date, n int) civil.Date {
	return civil.DateOf(d.Time().AddDate(0, 0, n))
}
