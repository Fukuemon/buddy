package schedule_test

import (
	"errors"
	"slices"
	"testing"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/schedule"
	"github.com/Fukuemon/buddy/services/schedule/internal/inmem"
)

// 始まった繰り返しの予定の曜日を変えると、元の繰り返しの予定を適用の日の前の日で終え、
// 時刻、職員、訪問の情報を写した新しい繰り返しの予定を作る。適用の日以降の置き換えた回は、単発の予定として残る（ADR-0037）。
func TestSchedulesChangeRuleSplits(t *testing.T) {
	s := inmem.Seeded()
	uc, _ := newSchedules(s)
	ctx := editorCtx()
	monday, tuesday := 1, 2
	in := visitSlot(validVisit())
	in.Date = civil.Date{Year: 2026, Month: 10, Day: 5}
	rs, err := uc.CreateRecurring(ctx, facilityID, in, schedule.RuleInput{Frequency: schedule.Weekly, DaysOfWeek: []int{monday}})
	if err != nil {
		t.Fatal(err)
	}
	replaced, err := uc.ChangeOccurrence(ctx, rs.ID, civil.Date{Year: 2026, Month: 10, Day: 26}, normalSlot())
	if err != nil {
		t.Fatal(err)
	}

	effective := civil.Date{Year: 2026, Month: 10, Day: 22}
	next, err := uc.ChangeRule(ctx, rs.ID, &effective, schedule.RuleInput{Frequency: schedule.Weekly, DaysOfWeek: []int{tuesday}})
	if err != nil {
		t.Fatal(err)
	}

	kept := s.Recurring[rs.ID]
	if want := (civil.Date{Year: 2026, Month: 10, Day: 21}); kept.Rule.EndDate == nil || *kept.Rule.EndDate != want || !slices.Equal(kept.Rule.DaysOfWeek, []int{monday}) {
		t.Errorf("元の繰り返しの予定の規則 = %+v, want 終了日 %v の毎週月曜", kept.Rule, want)
	}
	if next.ID == rs.ID || next.Date != (civil.Date{Year: 2026, Month: 10, Day: 27}) || !slices.Equal(next.Rule.DaysOfWeek, []int{tuesday}) || next.Rule.EndDate != nil {
		t.Errorf("新しい繰り返しの予定 = %+v", next)
	}
	if next.StaffID != rs.StaffID || next.StartTime != rs.StartTime || next.EndTime != rs.EndTime || next.TypeID != rs.TypeID {
		t.Errorf("新しい繰り返しの予定の枠 = %+v, want %+v の写し", next.Slot, rs.Slot)
	}
	if next.VisitInfoID == nil || *next.VisitInfoID == *rs.VisitInfoID {
		t.Fatalf("新しい繰り返しの予定の訪問の情報 = %v, want 元と別の行", next.VisitInfoID)
	}
	copied, orig := s.Infos[*next.VisitInfoID], s.Infos[*rs.VisitInfoID]
	if copied.PatientID != orig.PatientID || copied.ServiceCodeID != orig.ServiceCodeID || !slices.Equal(copied.CategoryIDs, orig.CategoryIDs) {
		t.Errorf("写した訪問の情報 = %+v, want %+v", copied, orig)
	}
	if got := s.Schedules[replaced.ID]; got.RecurringScheduleID == nil || *got.RecurringScheduleID != rs.ID {
		t.Errorf("置き換えた回の単発の予定 = %+v, want 元の繰り返しの予定を指したまま", got)
	}
}

// 分けるときは、置き換えた回の元の日に新しい規則が当たっても、新しい繰り返しの予定の除外する日にして回を出さない（ADR-0037）。
func TestSchedulesChangeRuleSplitExcludesReplacedDate(t *testing.T) {
	s := inmem.Seeded()
	uc, _ := newSchedules(s)
	ctx := editorCtx()
	monday, fourth := 1, 4
	in := normalSlot()
	in.Date = civil.Date{Year: 2026, Month: 10, Day: 5}
	rs, err := uc.CreateRecurring(ctx, facilityID, in, schedule.RuleInput{Frequency: schedule.Weekly, DaysOfWeek: []int{monday}})
	if err != nil {
		t.Fatal(err)
	}
	// 10-26 は第 4 月曜で、回を置き換えてある。置き換えた 11-02 は第 1 月曜で、新しい規則には当たらない
	replacedDate, other := civil.Date{Year: 2026, Month: 10, Day: 26}, civil.Date{Year: 2026, Month: 11, Day: 2}
	for _, d := range []civil.Date{replacedDate, other} {
		if _, err := uc.ChangeOccurrence(ctx, rs.ID, d, normalSlot()); err != nil {
			t.Fatal(err)
		}
	}

	effective := civil.Date{Year: 2026, Month: 10, Day: 22}
	next, err := uc.ChangeRule(ctx, rs.ID, &effective, schedule.RuleInput{Frequency: schedule.Monthly, WeekOfMonth: &fourth, DayOfWeek: &monday})
	if err != nil {
		t.Fatal(err)
	}
	if next.Date != replacedDate {
		t.Fatalf("新しい繰り返しの予定の最初の日付 = %v, want %v", next.Date, replacedDate)
	}
	if ex := s.Recurring[next.ID].ExclusionDates; !slices.Equal(ex, []civil.Date{replacedDate}) {
		t.Errorf("新しい繰り返しの予定の ExclusionDates = %v, want 置き換えた回の %v だけ", ex, replacedDate)
	}
}

// まだ始まっていない繰り返しの予定は、分けずに規則と最初の日付を書き換える。
// 取り消した回は引き継がず、置き換えた回の日は、回が単発の予定と重ならないように除外する日に残す（ADR-0037）。
func TestSchedulesChangeRuleInPlace(t *testing.T) {
	s := inmem.Seeded()
	uc, _ := newSchedules(s)
	ctx := editorCtx()
	monday := 1
	in := normalSlot()
	in.Date = civil.Date{Year: 2026, Month: 11, Day: 2}
	rs, err := uc.CreateRecurring(ctx, facilityID, in, schedule.RuleInput{Frequency: schedule.Weekly, DaysOfWeek: []int{monday}})
	if err != nil {
		t.Fatal(err)
	}
	cancelled, replacedDate := civil.Date{Year: 2026, Month: 11, Day: 9}, civil.Date{Year: 2026, Month: 11, Day: 2}
	if err := (inmem.RecurringSchedules{Store: s}).AddExclusion(ctx, rs.ID, cancelled); err != nil {
		t.Fatal(err)
	}
	if _, err := uc.ChangeOccurrence(ctx, rs.ID, replacedDate, normalSlot()); err != nil {
		t.Fatal(err)
	}

	// 毎月の第 2 月曜に変える。取り消した 11-09 は第 2 月曜だが、新しい規則には引き継がない
	week := 2
	effective := today
	got, err := uc.ChangeRule(ctx, rs.ID, &effective, schedule.RuleInput{Frequency: schedule.Monthly, WeekOfMonth: &week, DayOfWeek: &monday})
	if err != nil {
		t.Fatal(err)
	}
	if want := (civil.Date{Year: 2026, Month: 11, Day: 9}); got.ID != rs.ID || got.Date != want {
		t.Errorf("書き換えた繰り返しの予定 = %+v, want ID %s、最初の日付 %v", got, rs.ID, want)
	}
	stored := s.Recurring[rs.ID]
	if stored.Rule.Frequency != schedule.Monthly || stored.Date != got.Date {
		t.Errorf("保存した繰り返しの予定 = %+v", stored)
	}
	if ex := stored.ExclusionDates; !slices.Equal(ex, []civil.Date{replacedDate}) {
		t.Errorf("ExclusionDates = %v, want 置き換えた回の %v だけ", ex, replacedDate)
	}
}

// 終了日だけを変えるときは、分けずに終了日を書き換え、新しい終了日の後の取り消した回の日を消す。
func TestSchedulesChangeRuleEndDate(t *testing.T) {
	s := inmem.Seeded()
	uc, _ := newSchedules(s)
	ctx := editorCtx()
	end := civil.Date{Year: 2026, Month: 10, Day: 25}
	if err := (inmem.RecurringSchedules{Store: s}).AddExclusion(ctx, recurringID, civil.Date{Year: 2026, Month: 11, Day: 2}); err != nil {
		t.Fatal(err)
	}
	got, err := uc.ChangeRule(ctx, recurringID, nil, schedule.RuleInput{Frequency: schedule.Weekly, EndDate: &end})
	if err != nil {
		t.Fatal(err)
	}
	stored := s.Recurring[recurringID]
	if got.ID != recurringID || stored.Rule.EndDate == nil || *stored.Rule.EndDate != end || stored.Date != (civil.Date{Year: 2026, Month: 10, Day: 5}) {
		t.Errorf("保存した繰り返しの予定 = %+v", stored)
	}
	if len(stored.ExclusionDates) != 0 {
		t.Errorf("ExclusionDates = %v, want 無し", stored.ExclusionDates)
	}
}

func TestSchedulesChangeRuleErrors(t *testing.T) {
	tuesday := 2
	past := civil.Date{Year: 2026, Month: 10, Day: 20}
	tests := []struct {
		name        string
		recurringID string
		effective   *civil.Date
		wantErr     error
	}{
		{name: "適用の日が今日より前", recurringID: recurringID, effective: &past, wantErr: apperr.ErrInvalidInput},
		{name: "繰り返しの予定が無い", recurringID: "MISSING", effective: &today, wantErr: apperr.ErrNotFound},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			uc, _ := newSchedules(inmem.Seeded())
			_, err := uc.ChangeRule(editorCtx(), tt.recurringID, tt.effective, schedule.RuleInput{Frequency: schedule.Weekly, DaysOfWeek: []int{tuesday}})
			if !errors.Is(err, tt.wantErr) {
				t.Errorf("err = %v, want %v", err, tt.wantErr)
			}
		})
	}
}
