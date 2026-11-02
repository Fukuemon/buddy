package schedule_test

import (
	"errors"
	"testing"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/schedule"
	"github.com/Fukuemon/buddy/services/schedule/internal/inmem"
)

func TestSchedulesUpdate(t *testing.T) {
	tests := []struct {
		name      string
		in        func() schedule.SlotInput
		cancel    bool
		missing   bool
		single    bool
		wantErr   error
		wantMsg   string
		wantInfos int
	}{
		{name: "訪問の予定を通常の予定にすると訪問の情報を消す", in: normalSlot},
		{name: "訪問の情報を作り直す", in: func() schedule.SlotInput { return visitSlot(validVisit()) }, wantInfos: 1},
		{name: "繰り返しに属さない予定", in: normalSlot, single: true},
		{name: "キャンセル済み", in: normalSlot, cancel: true, wantErr: apperr.ErrConflict, wantMsg: "キャンセル済みの予定は変えられません", wantInfos: 1},
		{name: "予定がない", in: normalSlot, missing: true, wantErr: apperr.ErrNotFound, wantInfos: 1},
		{name: "別の事業所の職員", in: func() schedule.SlotInput {
			in := normalSlot()
			in.StaffID = otherStaffID
			return in
		}, wantErr: apperr.ErrInvalidInput, wantInfos: 1},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := inmem.Seeded()
			uc, tx := newSchedules(s)
			ctx := editorCtx()
			create := func() (schedule.Detail, error) {
				return uc.ChangeOccurrence(ctx, recurringID, civil.Date{Year: 2026, Month: 10, Day: 12}, visitSlot(validVisit()))
			}
			if tt.single {
				create = func() (schedule.Detail, error) { return uc.Create(ctx, facilityID, visitSlot(validVisit())) }
			}
			created, err := create()
			if err != nil {
				t.Fatal(err)
			}
			if tt.cancel {
				if _, err := uc.Cancel(ctx, created.ID, "体調不良"); err != nil {
					t.Fatal(err)
				}
			}
			id := created.ID
			if tt.missing {
				id = "MISSING"
			}
			calls := tx.Calls
			got, err := uc.Update(ctx, id, tt.in())
			if len(s.Infos) != tt.wantInfos {
				t.Errorf("訪問の情報 = %d 件, want %d", len(s.Infos), tt.wantInfos)
			}
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
			if tx.Calls != calls+1 {
				t.Errorf("トランザクションの回数 = %d", tx.Calls-calls)
			}
			if got.ID != created.ID || got.TypeID != tt.in().TypeID {
				t.Errorf("got %+v", got.Schedule)
			}
			if tt.single != (got.RecurringScheduleID == nil) || (!tt.single && *got.RecurringScheduleID != recurringID) {
				t.Errorf("RecurringScheduleID = %v", got.RecurringScheduleID)
			}
			if tt.wantInfos > 0 && (got.VisitInfoID == nil || *got.VisitInfoID == *created.VisitInfoID) {
				t.Errorf("VisitInfoID = %v, 前は %v", got.VisitInfoID, created.VisitInfoID)
			}
		})
	}
}
