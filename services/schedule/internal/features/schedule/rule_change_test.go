package schedule_test

import (
	"errors"
	"slices"
	"testing"
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/schedule"
)

func TestPlanRuleChange(t *testing.T) {
	// 2026-10-05 の月曜に始まる毎週月曜の繰り返し。今日は 2026-10-21（水曜）
	monday, tuesday := 1, 2
	date := func(day int) civil.Date { return civil.Date{Year: 2026, Month: 10, Day: day} }
	dp := func(day int) *civil.Date { d := date(day); return &d }
	base := schedule.RecurringSchedule{
		ID:   "R",
		Slot: schedule.Slot{Date: date(5)},
		Rule: schedule.Rule{Frequency: schedule.Weekly, DaysOfWeek: []int{monday}},
	}
	future := base
	future.Date = date(26)
	ended := base
	ended.Rule.EndDate = dp(26)
	finished := base
	finished.Rule.EndDate = dp(12)
	implicit := base
	implicit.Rule.DaysOfWeek = nil
	tests := []struct {
		name           string
		rs             schedule.RecurringSchedule
		effective      *civil.Date
		firstWeek      *civil.Date
		rule           schedule.Rule
		wantKind       schedule.RuleChangeKind
		wantKeptEnd    *civil.Date
		wantNextDate   civil.Date
		wantExclusions *civil.Date
		wantErr        bool
	}{
		{name: "始まった繰り返しの曜日を変えると、適用の日で分ける", rs: base, effective: dp(22),
			rule: schedule.Rule{Frequency: schedule.Weekly, DaysOfWeek: []int{tuesday}}, wantKind: schedule.RuleChangeSplit, wantKeptEnd: dp(21), wantNextDate: date(27)},
		{name: "適用の日が今日でも分ける", rs: base, effective: dp(21),
			rule: schedule.Rule{Frequency: schedule.Weekly, DaysOfWeek: []int{tuesday}}, wantKind: schedule.RuleChangeSplit, wantKeptEnd: dp(20), wantNextDate: date(27)},
		{name: "まだ始まっていない繰り返しは、分けずに最初の日付を書き換える", rs: future, effective: dp(21),
			rule: schedule.Rule{Frequency: schedule.Weekly, DaysOfWeek: []int{tuesday}}, wantKind: schedule.RuleChangeInPlace, wantNextDate: date(27), wantExclusions: dp(26)},
		{name: "終了日だけを変えるときは、適用の日を読まずに終了日を書き換える", rs: base,
			rule: schedule.Rule{Frequency: schedule.Weekly, DaysOfWeek: []int{monday}, EndDate: dp(20)}, wantKind: schedule.RuleChangeEndDate, wantNextDate: date(5), wantExclusions: dp(21)},
		{name: "終了日を無くす", rs: ended,
			rule: schedule.Rule{Frequency: schedule.Weekly, DaysOfWeek: []int{monday}}, wantKind: schedule.RuleChangeEndDate, wantNextDate: date(5)},
		{name: "曜日を省いた規則に、同じ曜日を値で書いて終了日だけを変える", rs: implicit,
			rule: schedule.Rule{Frequency: schedule.Weekly, DaysOfWeek: []int{monday}, EndDate: dp(30)}, wantKind: schedule.RuleChangeEndDate, wantNextDate: date(5), wantExclusions: dp(31)},
		{name: "終わった繰り返しの終了日を延ばす", rs: finished, rule: schedule.Rule{Frequency: schedule.Weekly, DaysOfWeek: []int{monday}, EndDate: dp(30)}, wantErr: true},
		{name: "終わった繰り返しの終了日を無くす", rs: finished, rule: schedule.Rule{Frequency: schedule.Weekly, DaysOfWeek: []int{monday}}, wantErr: true},
		{name: "終了日を今日の前の日より前にする", rs: base, rule: schedule.Rule{Frequency: schedule.Weekly, DaysOfWeek: []int{monday}, EndDate: dp(19)}, wantErr: true},
		{name: "規則を変えるのに適用の日が無い", rs: base, rule: schedule.Rule{Frequency: schedule.Weekly, DaysOfWeek: []int{tuesday}}, wantErr: true},
		{name: "適用の日が今日より前", rs: base, effective: dp(20), rule: schedule.Rule{Frequency: schedule.Weekly, DaysOfWeek: []int{tuesday}}, wantErr: true},
		{name: "適用の日が終了日の後", rs: ended, effective: dp(27), rule: schedule.Rule{Frequency: schedule.Weekly, DaysOfWeek: []int{tuesday}}, wantErr: true},
		{name: "新しい規則の回が終了日までに無い", rs: base, effective: dp(22),
			rule: schedule.Rule{Frequency: schedule.Weekly, DaysOfWeek: []int{tuesday}, EndDate: dp(26)}, wantErr: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := schedule.PlanRuleChange(tt.rs, tt.effective, tt.firstWeek, tt.rule, date(21))
			if tt.wantErr {
				if !errors.Is(err, apperr.ErrInvalidInput) {
					t.Fatalf("err = %v, want ErrInvalidInput", err)
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			if got.Kind != tt.wantKind {
				t.Errorf("Kind = %v, want %v", got.Kind, tt.wantKind)
			}
			if got.Next.Date != tt.wantNextDate {
				t.Errorf("Next.Date = %v, want %v", got.Next.Date, tt.wantNextDate)
			}
			if !equalDate(got.ExclusionsFrom, tt.wantExclusions) {
				t.Errorf("ExclusionsFrom = %v, want %v", got.ExclusionsFrom, tt.wantExclusions)
			}
			if tt.wantKind != schedule.RuleChangeSplit {
				if got.Next.ID != tt.rs.ID || got.Kept.ID != tt.rs.ID {
					t.Errorf("ID = %q, %q, want %q", got.Kept.ID, got.Next.ID, tt.rs.ID)
				}
				return
			}
			if got.Kept.Date != tt.rs.Date || !equalDate(got.Kept.Rule.EndDate, tt.wantKeptEnd) || !slices.Equal(got.Kept.Rule.DaysOfWeek, []int{monday}) {
				t.Errorf("Kept = %+v, want 終了日 %v の元の規則", got.Kept, tt.wantKeptEnd)
			}
			if got.Next.ID != "" || !slices.Equal(got.Next.Rule.DaysOfWeek, []int{tuesday}) {
				t.Errorf("Next = %+v", got.Next)
			}
		})
	}
}

func TestPlanRuleChangeInterval(t *testing.T) {
	// 今日は 2026-10-21（水曜）。日曜に始まる週は、10-04、10-11、10-18、10-25、11-01 に始まる
	date := func(month time.Month, day int) civil.Date { return civil.Date{Year: 2026, Month: month, Day: day} }
	oct := func(day int) civil.Date { return date(time.October, day) }
	octp := func(day int) *civil.Date { d := oct(day); return &d }
	weekly := func(first civil.Date, interval int, days ...int) schedule.RecurringSchedule {
		return schedule.RecurringSchedule{ID: "R", Slot: schedule.Slot{Date: first}, Rule: schedule.Rule{Frequency: schedule.Weekly, DaysOfWeek: days, Interval: interval}}
	}
	tests := []struct {
		name      string
		rs        schedule.RecurringSchedule
		effective *civil.Date
		firstWeek *civil.Date
		rule      schedule.Rule
		wantKind  schedule.RuleChangeKind
		wantFirst civil.Date
		occurs    []civil.Date
		notOccurs []civil.Date
	}{
		{
			name: "毎週の月曜を、適用の日の週を 1 週目にした隔週の月曜と木曜に分ける", rs: weekly(oct(5), 1, 1), effective: octp(22),
			rule:     schedule.Rule{Frequency: schedule.Weekly, DaysOfWeek: []int{4, 1}, Interval: 2},
			wantKind: schedule.RuleChangeSplit, wantFirst: oct(22),
			occurs: []civil.Date{date(time.November, 2), date(time.November, 5)}, notOccurs: []civil.Date{oct(26), oct(29)},
		},
		{
			name: "隔週の曜日を前に移しても、適用の日の週を 1 週目にして並びを保つ", rs: weekly(oct(7), 2, 3), effective: octp(21),
			rule:     schedule.Rule{Frequency: schedule.Weekly, DaysOfWeek: []int{2}, Interval: 2},
			wantKind: schedule.RuleChangeSplit, wantFirst: date(time.November, 3),
			occurs: []civil.Date{date(time.November, 17)}, notOccurs: []civil.Date{oct(27), date(time.November, 10)},
		},
		{
			name: "まだ始まっていない繰り返しは、元の最初の日付の週を 1 週目にする", rs: weekly(oct(26), 1, 1), effective: octp(21),
			rule:     schedule.Rule{Frequency: schedule.Weekly, DaysOfWeek: []int{1, 5}, Interval: 2},
			wantKind: schedule.RuleChangeInPlace, wantFirst: oct(26),
			occurs: []civil.Date{oct(30), date(time.November, 9)}, notOccurs: []civil.Date{date(time.November, 2), date(time.November, 6)},
		},
		{
			name: "間隔だけを変えても、終了日だけの変更にしない", rs: weekly(oct(5), 1, 1), effective: octp(26),
			rule:     schedule.Rule{Frequency: schedule.Weekly, DaysOfWeek: []int{1}, Interval: 2},
			wantKind: schedule.RuleChangeSplit, wantFirst: oct(26),
			occurs: []civil.Date{date(time.November, 9)}, notOccurs: []civil.Date{date(time.November, 2)},
		},
		{
			name: "曜日の並びの順だけが違うときは、終了日だけの変更にする", rs: weekly(oct(5), 1, 1, 4),
			rule:     schedule.Rule{Frequency: schedule.Weekly, DaysOfWeek: []int{4, 1}, EndDate: octp(29)},
			wantKind: schedule.RuleChangeEndDate, wantFirst: oct(5),
			occurs: []civil.Date{oct(26), oct(29)}, notOccurs: []civil.Date{date(time.November, 2)},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := schedule.PlanRuleChange(tt.rs, tt.effective, tt.firstWeek, tt.rule, oct(21))
			if err != nil {
				t.Fatal(err)
			}
			if got.Kind != tt.wantKind || got.Next.Date != tt.wantFirst {
				t.Fatalf("Kind = %v, Next.Date = %v, want %v, %v", got.Kind, got.Next.Date, tt.wantKind, tt.wantFirst)
			}
			for _, d := range tt.occurs {
				if !got.Next.HasOccurrenceOn(d) {
					t.Errorf("%s に回が無い", d)
				}
			}
			for _, d := range tt.notOccurs {
				if got.Next.HasOccurrenceOn(d) {
					t.Errorf("%s に回がある", d)
				}
			}
		})
	}
}

func TestPlanRuleChangeFirstWeek(t *testing.T) {
	// 今日は 2026-11-08（日曜）。元の規則は 2026-10-05 に始まる隔週の月曜で、11-02 と 11-16 に回がある（#902）
	date := func(month time.Month, day int) civil.Date { return civil.Date{Year: 2026, Month: month, Day: day} }
	nov := func(day int) civil.Date { return date(time.November, day) }
	novp := func(day int) *civil.Date { d := nov(day); return &d }
	today := nov(8)
	rs := schedule.RecurringSchedule{ID: "R", Slot: schedule.Slot{Date: date(time.October, 5)}, Rule: schedule.Rule{Frequency: schedule.Weekly, DaysOfWeek: []int{1}, Interval: 2}}
	mondayThursday := schedule.Rule{Frequency: schedule.Weekly, DaysOfWeek: []int{1, 4}, Interval: 2}
	tests := []struct {
		name      string
		effective *civil.Date
		firstWeek *civil.Date
		wantFirst civil.Date
		occurs    []civil.Date
		notOccurs []civil.Date
	}{
		{
			name: "今日より前の回の週を 1 週目にして、今日以降の回だけを作る", effective: &today, firstWeek: novp(2), wantFirst: nov(16),
			occurs: []civil.Date{nov(16), nov(19), nov(30)}, notOccurs: []civil.Date{nov(9), nov(12), nov(23)},
		},
		{
			name: "1 週目を決める日を省くと、適用の日の週を 1 週目にする", effective: &today, wantFirst: nov(9),
			occurs: []civil.Date{nov(9), nov(12), nov(23)}, notOccurs: []civil.Date{nov(16), nov(19)},
		},
		{
			name: "1 週目を決める日が適用の日と同じなら、省いたときと同じになる", effective: novp(16), firstWeek: novp(16), wantFirst: nov(16),
			occurs: []civil.Date{nov(19), nov(30)}, notOccurs: []civil.Date{nov(23)},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := schedule.PlanRuleChange(rs, tt.effective, tt.firstWeek, mondayThursday, today)
			if err != nil {
				t.Fatal(err)
			}
			if got.Kind != schedule.RuleChangeSplit || got.Next.Date != tt.wantFirst {
				t.Fatalf("Kind = %v, Next.Date = %v, want %v, %v", got.Kind, got.Next.Date, schedule.RuleChangeSplit, tt.wantFirst)
			}
			if !equalDate(got.Kept.Rule.EndDate, novp(tt.effective.Day-1)) {
				t.Errorf("Kept.Rule.EndDate = %v, want 適用の日の前の日", got.Kept.Rule.EndDate)
			}
			for _, d := range tt.occurs {
				if !got.Next.HasOccurrenceOn(d) {
					t.Errorf("%s に回が無い", d)
				}
			}
			for _, d := range tt.notOccurs {
				if got.Next.HasOccurrenceOn(d) {
					t.Errorf("%s に回がある", d)
				}
			}
		})
	}
	for name, firstWeek := range map[string]*civil.Date{
		"1 週目を決める日が適用の日の後":   novp(9),
		"1 週目を決める日が最初の日付より前": func() *civil.Date { d := date(time.October, 4); return &d }(),
	} {
		t.Run(name, func(t *testing.T) {
			if _, err := schedule.PlanRuleChange(rs, &today, firstWeek, mondayThursday, today); !errors.Is(err, apperr.ErrInvalidInput) {
				t.Fatalf("err = %v, want ErrInvalidInput", err)
			}
		})
	}
}

func equalDate(a, b *civil.Date) bool {
	if a == nil || b == nil {
		return a == b
	}
	return *a == *b
}
