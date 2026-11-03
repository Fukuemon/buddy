package schedule_test

import (
	"errors"
	"testing"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
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
