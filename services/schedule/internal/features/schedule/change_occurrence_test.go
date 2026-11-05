package schedule_test

import (
	"errors"
	"testing"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/schedule"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/staff"
	"github.com/Fukuemon/buddy/services/schedule/internal/inmem"
)

func TestSchedulesChangeOccurrence(t *testing.T) {
	monday := civil.Date{Year: 2026, Month: 10, Day: 12}
	tests := []struct {
		name        string
		recurringID string
		date        civil.Date
		repeat      bool
		wantErr     error
		wantMsg     string
	}{
		{name: "回を置き換える", recurringID: recurringID, date: monday},
		{name: "同じ回を 2 度置き換える", recurringID: recurringID, date: monday, repeat: true, wantErr: apperr.ErrConflict,
			wantMsg: "2026-10-12 の回はすでに置き換えられています"},
		{name: "回に当たらない日", recurringID: recurringID, date: civil.Date{Year: 2026, Month: 10, Day: 13}, wantErr: apperr.ErrInvalidInput},
		{name: "繰り返しの予定がない", recurringID: "MISSING", date: monday, wantErr: apperr.ErrNotFound},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := inmem.Seeded()
			uc, _ := newSchedules(s)
			ctx := editorCtx()
			if tt.repeat {
				if _, err := uc.ChangeOccurrence(ctx, tt.recurringID, tt.date, normalSlot()); err != nil {
					t.Fatal(err)
				}
			}
			got, err := uc.ChangeOccurrence(ctx, tt.recurringID, tt.date, normalSlot())
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
			if got.RecurringScheduleID == nil || *got.RecurringScheduleID != recurringID {
				t.Errorf("RecurringScheduleID = %v", got.RecurringScheduleID)
			}
			if got.OriginalDate == nil || *got.OriginalDate != tt.date {
				t.Errorf("OriginalDate = %v, want %v", got.OriginalDate, tt.date)
			}
			if ex := s.Recurring[recurringID].ExclusionDates; len(ex) != 1 || ex[0] != tt.date {
				t.Errorf("ExclusionDates = %v", ex)
			}
		})
	}
}

// 回の置き換えは、繰り返しの予定の訪問の情報に既に割り振った利用者と職員を、同じ役割のまま保存できる。
// 利用の終了の利用者と退職した職員は、今日より前の回でだけ保存できる（ADR-0019、ADR-0018）。
func TestSchedulesChangeOccurrenceKeepsRecurringVisit(t *testing.T) {
	past, next := civil.Date{Year: 2026, Month: 10, Day: 20}, civil.Date{Year: 2026, Month: 10, Day: 27}
	tests := []struct {
		name       string
		companion  staff.Status
		endPatient bool
		original   civil.Date
		date       civil.Date
		wantErr    bool
	}{
		{name: "利用の終了の利用者と休職の同行者のまま過去の回を置き換える", companion: staff.StatusOnLeave, endPatient: true, original: past, date: past},
		{name: "休職の同行者のまま回を今日に置き換える", companion: staff.StatusOnLeave, original: next, date: today},
		{name: "利用の終了の利用者のまま回を今日に置き換える", endPatient: true, original: next, date: today, wantErr: true},
		{name: "退職した同行者のまま過去の回を置き換える", companion: staff.StatusRetired, original: past, date: past},
		{name: "退職した同行者のまま回を今日に置き換える", companion: staff.StatusRetired, original: next, date: today, wantErr: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := inmem.Seeded()
			uc, _ := newSchedules(s)
			ctx := editorCtx()
			rs, err := uc.CreateRecurring(ctx, facilityID, visitSlot(validVisit()), schedule.RuleInput{Frequency: schedule.Weekly})
			if err != nil {
				t.Fatal(err)
			}
			if tt.companion != "" {
				stop(t, s, companionID, tt.companion)
			}
			if tt.endPatient {
				if err := (inmem.Patients{Store: s}).End(ctx, patientID); err != nil {
					t.Fatal(err)
				}
			}
			in := visitSlot(validVisit())
			in.Date = tt.date
			got, err := uc.ChangeOccurrence(ctx, rs.ID, tt.original, in)
			if tt.wantErr {
				if !errors.Is(err, apperr.ErrInvalidInput) {
					t.Fatalf("err = %v, want ErrInvalidInput", err)
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			if got.VisitInfoID == nil || s.Infos[*got.VisitInfoID].PatientID != patientID {
				t.Errorf("置き換えた予定の訪問の情報 = %v", got.VisitInfoID)
			}
		})
	}
}
