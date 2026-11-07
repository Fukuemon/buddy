package schedule_test

import (
	"errors"
	"reflect"
	"testing"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/schedule"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/staff"
	"github.com/Fukuemon/buddy/services/schedule/internal/inmem"
)

func TestSchedulesCancelOccurrence(t *testing.T) {
	next := civil.Date{Year: 2026, Month: 10, Day: 27}
	tests := []struct {
		name     string
		missing  bool
		date     civil.Date
		reason   string
		replaced bool
		wantErr  error
		wantMsg  string
	}{
		{name: "回をキャンセルする", date: next, reason: "体調不良"},
		{name: "置き換えた回をキャンセルする", date: next, reason: "体調不良", replaced: true, wantErr: apperr.ErrConflict,
			wantMsg: "2026-10-27 の回はすでに置き換えられています"},
		{name: "理由が空", date: next, wantErr: apperr.ErrInvalidInput},
		{name: "回に当たらない日", date: civil.Date{Year: 2026, Month: 10, Day: 28}, reason: "体調不良", wantErr: apperr.ErrInvalidInput},
		{name: "繰り返しの予定がない", missing: true, date: next, reason: "体調不良", wantErr: apperr.ErrNotFound},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := inmem.Seeded()
			uc, _ := newSchedules(s)
			ctx := editorCtx()
			created, err := uc.CreateRecurring(ctx, facilityID, normalSlot(), schedule.RuleInput{Frequency: schedule.Weekly})
			if err != nil {
				t.Fatal(err)
			}
			id := created.ID
			if tt.missing {
				id = "MISSING"
			}
			if tt.replaced {
				if _, err := uc.ChangeOccurrence(ctx, id, tt.date, normalSlot()); err != nil {
					t.Fatal(err)
				}
			}
			got, err := uc.CancelOccurrence(ctx, id, tt.date, tt.reason)
			if tt.wantErr != nil {
				if !errors.Is(err, tt.wantErr) {
					t.Fatalf("err = %v, want %v", err, tt.wantErr)
				}
				if tt.wantMsg != "" && err.Error() != tt.wantMsg {
					t.Errorf("message = %q, want %q", err.Error(), tt.wantMsg)
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			rs := s.Recurring[id]
			sc := s.Schedules[got.ScheduleID]
			if sc.RecurringScheduleID == nil || *sc.RecurringScheduleID != id || sc.OriginalDate == nil || *sc.OriginalDate != tt.date {
				t.Errorf("キャンセルした回の元 = %v, %v", sc.RecurringScheduleID, sc.OriginalDate)
			}
			if sc.Date != tt.date || sc.StartTime != rs.StartTime || sc.StaffID != rs.StaffID || sc.TypeID != rs.TypeID {
				t.Errorf("キャンセルした回 = %+v, want 繰り返しの予定と同じ枠", sc.Slot)
			}
			if c, ok := s.Cancels[got.ScheduleID]; !ok || c.Reason != tt.reason {
				t.Errorf("キャンセル = %+v", c)
			}
			if ex := rs.ExclusionDates; len(ex) != 1 || ex[0] != tt.date {
				t.Errorf("ExclusionDates = %v", ex)
			}
		})
	}
}

// 回のキャンセルは回の内容を変えないので、繰り返しの予定の職員が退職していても、今日以降の回をキャンセルできる。
func TestSchedulesCancelOccurrenceOfRetiredStaff(t *testing.T) {
	s := inmem.Seeded()
	uc, _ := newSchedules(s)
	ctx := editorCtx()
	rs, err := uc.CreateRecurring(ctx, facilityID, visitSlot(validVisit()), schedule.RuleInput{Frequency: schedule.Weekly})
	if err != nil {
		t.Fatal(err)
	}
	stop(t, s, companionID, staff.StatusRetired)
	next := civil.Date{Year: 2026, Month: 10, Day: 27}
	got, err := uc.CancelOccurrence(ctx, rs.ID, next, "退職のため")
	if err != nil {
		t.Fatal(err)
	}
	sc := s.Schedules[got.ScheduleID]
	if sc.VisitInfoID == nil || rs.VisitInfoID == nil || *sc.VisitInfoID == *rs.VisitInfoID {
		t.Fatalf("キャンセルした回の訪問の情報 = %v, want 繰り返しの予定の %v を写した別の訪問の情報", sc.VisitInfoID, rs.VisitInfoID)
	}
	copied, orig := s.Infos[*sc.VisitInfoID], s.Infos[*rs.VisitInfoID]
	copied.ID = orig.ID
	if !reflect.DeepEqual(copied, orig) {
		t.Errorf("写した訪問の情報 = %+v, want %+v", copied, orig)
	}
}
