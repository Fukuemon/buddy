package schedule_test

import (
	"errors"
	"slices"
	"testing"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/schedule"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/staff"
	"github.com/Fukuemon/buddy/services/schedule/internal/inmem"
)

// futureSlot は、今日（2026-10-21）以降の日付の予定の入力を返す。
func futureSlot(in schedule.SlotInput, d civil.Date) schedule.SlotInput {
	in.Date = d
	return in
}

func TestSchedulesDelete(t *testing.T) {
	s := inmem.Seeded()
	uc, _ := newSchedules(s)
	ctx := editorCtx()
	created, err := uc.Create(ctx, facilityID, futureSlot(visitSlot(validVisit()), today))
	if err != nil {
		t.Fatal(err)
	}
	infoID := *s.Schedules[created.ID].VisitInfoID
	if err := uc.Delete(ctx, created.ID); err != nil {
		t.Fatal(err)
	}
	if _, ok := s.Schedules[created.ID]; ok {
		t.Error("削除した予定の行が残っている")
	}
	if _, ok := s.Infos[infoID]; ok {
		t.Error("削除した予定の訪問の情報が残っている")
	}
	want := []schedule.Deletion{{ID: s.Deletions[0].ID, FacilityID: facilityID, ScheduleID: created.ID, Date: today, StaffID: staffID, DeletedBy: "EDITOR"}}
	if !slices.Equal(s.Deletions, want) {
		t.Errorf("監査の記録 = %+v, want %+v", s.Deletions, want)
	}
	if err := uc.Delete(ctx, created.ID); !errors.Is(err, apperr.ErrNotFound) {
		t.Errorf("2 回目の削除: err = %v, want ErrNotFound", err)
	}
}

func TestSchedulesDeleteRejects(t *testing.T) {
	tests := []struct {
		name    string
		date    civil.Date
		cancel  bool
		wantErr error
		wantMsg string
	}{
		{name: "今日より前の予定", date: civil.Date{Year: 2026, Month: 10, Day: 20}, wantErr: apperr.ErrInvalidInput, wantMsg: "今日より前の予定は削除できません"},
		{name: "キャンセル済みの予定", date: today, cancel: true, wantErr: apperr.ErrConflict, wantMsg: "キャンセル済みの予定は削除できません"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := inmem.Seeded()
			uc, _ := newSchedules(s)
			ctx := editorCtx()
			created, err := uc.Create(ctx, facilityID, futureSlot(normalSlot(), tt.date))
			if err != nil {
				t.Fatal(err)
			}
			if tt.cancel {
				if _, err := uc.Cancel(ctx, created.ID, "体調不良"); err != nil {
					t.Fatal(err)
				}
			}
			err = uc.Delete(ctx, created.ID)
			if !errors.Is(err, tt.wantErr) || err.Error() != tt.wantMsg {
				t.Fatalf("err = %v, want %v（%s）", err, tt.wantErr, tt.wantMsg)
			}
			if _, ok := s.Schedules[created.ID]; !ok || len(s.Deletions) != 0 {
				t.Errorf("拒んだ削除で予定が消えたか、監査の記録 %v が残った", s.Deletions)
			}
		})
	}
}

// 削除の可否は、キャンセルと同じく、予定の職員の予定を編集する権限で判定する（ADR-0040）。
func TestSchedulesDeleteAuthorization(t *testing.T) {
	s := authzStore()
	uc, _ := newSchedules(s)
	created, err := uc.Create(editorCtx(), facilityID, futureSlot(normalSlot(), today))
	if err != nil {
		t.Fatal(err)
	}
	rs, err := uc.CreateRecurring(editorCtx(), facilityID, futureSlot(normalSlot(), today), schedule.RuleInput{Frequency: schedule.Weekly})
	if err != nil {
		t.Fatal(err)
	}
	read := viewerCtx(staff.PolicyGrant{PolicyCode: organization.ScheduleAllRead})
	if err := uc.Delete(read, created.ID); !errors.Is(err, apperr.ErrForbidden) {
		t.Errorf("閲覧だけの職員の削除: err = %v, want ErrForbidden", err)
	}
	if err := uc.DeleteOccurrence(read, rs.ID, today); !errors.Is(err, apperr.ErrForbidden) {
		t.Errorf("閲覧だけの職員の回の削除: err = %v, want ErrForbidden", err)
	}
	edit := viewerCtx(staff.PolicyGrant{PolicyCode: organization.ScheduleTeamEdit, TargetTeamIDs: []string{targetTeam}})
	if err := uc.Delete(edit, created.ID); err != nil {
		t.Errorf("チームの予定を編集できる職員の削除: err = %v", err)
	}
	if err := uc.DeleteOccurrence(edit, rs.ID, today); err != nil {
		t.Errorf("チームの予定を編集できる職員の回の削除: err = %v", err)
	}
}

func TestSchedulesDeleteOccurrence(t *testing.T) {
	next := civil.Date{Year: 2026, Month: 10, Day: 27}
	tests := []struct {
		name     string
		date     civil.Date
		replaced bool
		twice    bool
		wantErr  error
		wantMsg  string
	}{
		{name: "回を削除する", date: next},
		{name: "今日より前の回", date: civil.Date{Year: 2026, Month: 10, Day: 20}, wantErr: apperr.ErrInvalidInput, wantMsg: "今日より前の予定は削除できません"},
		{name: "回に当たらない日", date: civil.Date{Year: 2026, Month: 10, Day: 28}, wantErr: apperr.ErrInvalidInput},
		{name: "置き換えた回", date: next, replaced: true, wantErr: apperr.ErrConflict,
			wantMsg: "2026-10-27 の回はすでに置き換えたか、キャンセルしたか、削除しています"},
		{name: "削除した回", date: next, twice: true, wantErr: apperr.ErrConflict},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := inmem.Seeded()
			uc, _ := newSchedules(s)
			ctx := editorCtx()
			rs, err := uc.CreateRecurring(ctx, facilityID, normalSlot(), schedule.RuleInput{Frequency: schedule.Weekly})
			if err != nil {
				t.Fatal(err)
			}
			if tt.replaced {
				if _, err := uc.ChangeOccurrence(ctx, rs.ID, tt.date, normalSlot()); err != nil {
					t.Fatal(err)
				}
			}
			if tt.twice {
				if err := uc.DeleteOccurrence(ctx, rs.ID, tt.date); err != nil {
					t.Fatal(err)
				}
			}
			schedules, deletions := len(s.Schedules), len(s.Deletions)
			err = uc.DeleteOccurrence(ctx, rs.ID, tt.date)
			if tt.wantErr != nil {
				if !errors.Is(err, tt.wantErr) || (tt.wantMsg != "" && err.Error() != tt.wantMsg) {
					t.Fatalf("err = %v, want %v（%s）", err, tt.wantErr, tt.wantMsg)
				}
				if len(s.Deletions) != deletions {
					t.Errorf("拒んだ回の削除で監査の記録 %v が残った", s.Deletions)
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			if got := s.Recurring[rs.ID].ExclusionDates; !slices.Equal(got, []civil.Date{tt.date}) {
				t.Errorf("除外する日 = %v, want [%s]", got, tt.date)
			}
			if len(s.Schedules) != schedules {
				t.Errorf("単発の予定 %d → %d, want 作らない", schedules, len(s.Schedules))
			}
			want := schedule.Deletion{ID: s.Deletions[0].ID, FacilityID: facilityID, RecurringScheduleID: rs.ID, Date: tt.date, StaffID: staffID, DeletedBy: "EDITOR"}
			if !slices.Equal(s.Deletions, []schedule.Deletion{want}) {
				t.Errorf("監査の記録 = %+v, want %+v", s.Deletions, want)
			}
		})
	}
}

// 置き換えた回を削除しても、元の回に戻さない。その日は除外する日のまま残る（ADR-0040）。
func TestSchedulesDeleteReplacedOccurrence(t *testing.T) {
	s := inmem.Seeded()
	uc, _ := newSchedules(s)
	ctx := editorCtx()
	next := civil.Date{Year: 2026, Month: 10, Day: 27}
	rs, err := uc.CreateRecurring(ctx, facilityID, normalSlot(), schedule.RuleInput{Frequency: schedule.Weekly})
	if err != nil {
		t.Fatal(err)
	}
	replaced, err := uc.ChangeOccurrence(ctx, rs.ID, next, futureSlot(normalSlot(), next))
	if err != nil {
		t.Fatal(err)
	}
	if err := uc.Delete(ctx, replaced.ID); err != nil {
		t.Fatal(err)
	}
	if got := s.Recurring[rs.ID].ExclusionDates; !slices.Equal(got, []civil.Date{next}) {
		t.Errorf("除外する日 = %v, want [%s] のまま", got, next)
	}
	if _, ok := s.Schedules[replaced.ID]; ok {
		t.Error("置き換えた回の予定が残っている")
	}
}

// 回を削除した日に新しい規則の回が当たれば、規則を変えた後にその回を出す。削除した日は引き継がない（ADR-0040）。
func TestSchedulesDeleteOccurrenceThenChangeRule(t *testing.T) {
	tuesday, wednesday := 2, 3
	next := civil.Date{Year: 2026, Month: 10, Day: 27}
	t.Run("繰り返しの予定を分ける", func(t *testing.T) {
		s := inmem.Seeded()
		uc, _ := newSchedules(s)
		ctx := editorCtx()
		rs, err := uc.CreateRecurring(ctx, facilityID, normalSlot(), schedule.RuleInput{Frequency: schedule.Weekly})
		if err != nil {
			t.Fatal(err)
		}
		if err := uc.DeleteOccurrence(ctx, rs.ID, next); err != nil {
			t.Fatal(err)
		}
		got, err := uc.ChangeRule(ctx, rs.ID, &next, nil, schedule.RuleInput{Frequency: schedule.Weekly, DaysOfWeek: []int{tuesday, wednesday}})
		if err != nil {
			t.Fatal(err)
		}
		if got.ID == rs.ID || got.Date != next || slices.Contains(s.Recurring[got.ID].ExclusionDates, next) {
			t.Errorf("新しい繰り返しの予定 = %s（最初の日付 %s、除外する日 %v）, want %s の回を出す", got.ID, got.Date, s.Recurring[got.ID].ExclusionDates, next)
		}
	})
	t.Run("繰り返しの予定を分けない", func(t *testing.T) {
		s := inmem.Seeded()
		uc, _ := newSchedules(s)
		ctx := editorCtx()
		rs, err := uc.CreateRecurring(ctx, facilityID, futureSlot(normalSlot(), next), schedule.RuleInput{Frequency: schedule.Weekly})
		if err != nil {
			t.Fatal(err)
		}
		if err := uc.DeleteOccurrence(ctx, rs.ID, next); err != nil {
			t.Fatal(err)
		}
		if _, err := uc.ChangeRule(ctx, rs.ID, &next, nil, schedule.RuleInput{Frequency: schedule.Weekly, DaysOfWeek: []int{tuesday, wednesday}}); err != nil {
			t.Fatal(err)
		}
		if got := s.Recurring[rs.ID].ExclusionDates; len(got) != 0 {
			t.Errorf("除外する日 = %v, want 削除した日を引き継がない", got)
		}
	})
}

// 回をキャンセルした単発の予定も、キャンセル済みなので削除できない。キャンセルした日の回の削除も、除外済みなので拒む（ADR-0040）。
func TestSchedulesDeleteCancelledOccurrence(t *testing.T) {
	s := inmem.Seeded()
	uc, _ := newSchedules(s)
	ctx := editorCtx()
	next := civil.Date{Year: 2026, Month: 10, Day: 27}
	rs, err := uc.CreateRecurring(ctx, facilityID, normalSlot(), schedule.RuleInput{Frequency: schedule.Weekly})
	if err != nil {
		t.Fatal(err)
	}
	c, err := uc.CancelOccurrence(ctx, rs.ID, next, "休み")
	if err != nil {
		t.Fatal(err)
	}
	if err := uc.Delete(ctx, c.ScheduleID); !errors.Is(err, apperr.ErrConflict) {
		t.Errorf("回をキャンセルした予定の削除: err = %v, want ErrConflict", err)
	}
	if err := uc.DeleteOccurrence(ctx, rs.ID, next); !errors.Is(err, apperr.ErrConflict) {
		t.Errorf("キャンセルした日の回の削除: err = %v, want ErrConflict", err)
	}
	if len(s.Deletions) != 0 {
		t.Errorf("監査の記録 = %v, want 残さない", s.Deletions)
	}
}

// 置き換えた回を削除した後に規則を変えると、元の日に新しい規則の回が当たれば回を出す（ADR-0040）。
// 終了日だけの変更は新しい終了日の後の除外する日だけを扱うので、ここでは確かめない（繰り返しの予定の context）。
func TestSchedulesDeleteReplacedThenChangeRule(t *testing.T) {
	tuesday, wednesday := 2, 3
	next := civil.Date{Year: 2026, Month: 10, Day: 27}
	for name, rule := range map[string]schedule.RuleInput{
		"規則を書き換える": {Frequency: schedule.Weekly, DaysOfWeek: []int{tuesday, wednesday}},
	} {
		t.Run(name, func(t *testing.T) {
			s := inmem.Seeded()
			uc, _ := newSchedules(s)
			ctx := editorCtx()
			rs, err := uc.CreateRecurring(ctx, facilityID, futureSlot(normalSlot(), next), schedule.RuleInput{Frequency: schedule.Weekly})
			if err != nil {
				t.Fatal(err)
			}
			replaced, err := uc.ChangeOccurrence(ctx, rs.ID, next, futureSlot(normalSlot(), next))
			if err != nil {
				t.Fatal(err)
			}
			if err := uc.Delete(ctx, replaced.ID); err != nil {
				t.Fatal(err)
			}
			if _, err := uc.ChangeRule(ctx, rs.ID, &next, nil, rule); err != nil {
				t.Fatal(err)
			}
			if got := s.Recurring[rs.ID].ExclusionDates; slices.Contains(got, next) {
				t.Errorf("除外する日 = %v, want %s を引き継がない", got, next)
			}
		})
	}
}

// 削除した予定の ID で予定を作り直そうとすると、409 で拒む。削除の書き出しの待ちと監査の記録が、同じ ID の別の予定を指さないためである。
func TestSchedulesCreateRejectsDeletedID(t *testing.T) {
	s := inmem.Seeded()
	uc, _ := newSchedules(s)
	ctx := editorCtx()
	in := futureSlot(normalSlot(), today)
	in.ID = "01M3TD000000000000000000Z1"
	if _, err := uc.Create(ctx, facilityID, in); err != nil {
		t.Fatal(err)
	}
	if err := uc.Delete(ctx, in.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := uc.Create(ctx, facilityID, in); !errors.Is(err, apperr.ErrConflict) {
		t.Errorf("削除した ID での作成: err = %v, want ErrConflict", err)
	}
}
