package schedule_test

import (
	"errors"
	"testing"

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
		Rule: schedule.Rule{Frequency: schedule.Weekly, DayOfWeek: &monday},
	}
	future := base
	future.Date = date(26)
	ended := base
	ended.Rule.EndDate = dp(26)
	finished := base
	finished.Rule.EndDate = dp(12)
	implicit := base
	implicit.Rule.DayOfWeek = nil
	tests := []struct {
		name           string
		rs             schedule.RecurringSchedule
		effective      *civil.Date
		rule           schedule.Rule
		wantKind       schedule.RuleChangeKind
		wantKeptEnd    *civil.Date
		wantNextDate   civil.Date
		wantExclusions *civil.Date
		wantErr        bool
	}{
		{name: "始まった繰り返しの曜日を変えると、適用の日で分ける", rs: base, effective: dp(22),
			rule: schedule.Rule{Frequency: schedule.Weekly, DayOfWeek: &tuesday}, wantKind: schedule.RuleChangeSplit, wantKeptEnd: dp(21), wantNextDate: date(27)},
		{name: "適用の日が今日でも分ける", rs: base, effective: dp(21),
			rule: schedule.Rule{Frequency: schedule.Weekly, DayOfWeek: &tuesday}, wantKind: schedule.RuleChangeSplit, wantKeptEnd: dp(20), wantNextDate: date(27)},
		{name: "まだ始まっていない繰り返しは、分けずに最初の日付を書き換える", rs: future, effective: dp(21),
			rule: schedule.Rule{Frequency: schedule.Weekly, DayOfWeek: &tuesday}, wantKind: schedule.RuleChangeInPlace, wantNextDate: date(27), wantExclusions: dp(26)},
		{name: "終了日だけを変えるときは、適用の日を読まずに終了日を書き換える", rs: base,
			rule: schedule.Rule{Frequency: schedule.Weekly, DayOfWeek: &monday, EndDate: dp(20)}, wantKind: schedule.RuleChangeEndDate, wantNextDate: date(5), wantExclusions: dp(21)},
		{name: "終了日を無くす", rs: ended,
			rule: schedule.Rule{Frequency: schedule.Weekly, DayOfWeek: &monday}, wantKind: schedule.RuleChangeEndDate, wantNextDate: date(5)},
		{name: "曜日を省いた規則に、同じ曜日を値で書いて終了日だけを変える", rs: implicit,
			rule: schedule.Rule{Frequency: schedule.Weekly, DayOfWeek: &monday, EndDate: dp(30)}, wantKind: schedule.RuleChangeEndDate, wantNextDate: date(5), wantExclusions: dp(31)},
		{name: "終わった繰り返しの終了日を延ばす", rs: finished, rule: schedule.Rule{Frequency: schedule.Weekly, DayOfWeek: &monday, EndDate: dp(30)}, wantErr: true},
		{name: "終わった繰り返しの終了日を無くす", rs: finished, rule: schedule.Rule{Frequency: schedule.Weekly, DayOfWeek: &monday}, wantErr: true},
		{name: "終了日を今日の前の日より前にする", rs: base, rule: schedule.Rule{Frequency: schedule.Weekly, DayOfWeek: &monday, EndDate: dp(19)}, wantErr: true},
		{name: "規則を変えるのに適用の日が無い", rs: base, rule: schedule.Rule{Frequency: schedule.Weekly, DayOfWeek: &tuesday}, wantErr: true},
		{name: "適用の日が今日より前", rs: base, effective: dp(20), rule: schedule.Rule{Frequency: schedule.Weekly, DayOfWeek: &tuesday}, wantErr: true},
		{name: "適用の日が終了日の後", rs: ended, effective: dp(27), rule: schedule.Rule{Frequency: schedule.Weekly, DayOfWeek: &tuesday}, wantErr: true},
		{name: "新しい規則の回が終了日までに無い", rs: base, effective: dp(22),
			rule: schedule.Rule{Frequency: schedule.Weekly, DayOfWeek: &tuesday, EndDate: dp(26)}, wantErr: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := schedule.PlanRuleChange(tt.rs, tt.effective, tt.rule, date(21))
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
			if got.Kept.Date != tt.rs.Date || !equalDate(got.Kept.Rule.EndDate, tt.wantKeptEnd) || *got.Kept.Rule.DayOfWeek != monday {
				t.Errorf("Kept = %+v, want 終了日 %v の元の規則", got.Kept, tt.wantKeptEnd)
			}
			if got.Next.ID != "" || *got.Next.Rule.DayOfWeek != tuesday {
				t.Errorf("Next = %+v", got.Next)
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
