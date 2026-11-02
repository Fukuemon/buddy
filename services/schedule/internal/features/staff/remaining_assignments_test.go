package staff_test

import (
	"context"
	"errors"
	"testing"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/schedule"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/staff"
)

// TestStaffRemainingAssignments は、休職と同じ一覧を、職員とブローカーを書かずに返すことを確認する。
func TestStaffRemainingAssignments(t *testing.T) {
	ctx := context.Background()
	s, ids := stopFixture()
	s.Schedules["PAST"] = schedule.Detail{Schedule: schedule.Schedule{ID: "PAST", Slot: schedule.Slot{
		FacilityID: facilityID, StaffID: staffID, Date: civil.Date{Year: 2026, Month: 10, Day: 22}}}}
	s.Schedules["TODAY"] = schedule.Detail{Schedule: schedule.Schedule{ID: "TODAY", Slot: schedule.Slot{
		FacilityID: facilityID, StaffID: staffID, Date: civil.Date{Year: 2026, Month: 10, Day: 23}}}}

	got, err := stopUsecase(s, ids, allow).RemainingAssignments(ctx, staffID)
	if err != nil {
		t.Fatal(err)
	}
	left, err := stopUsecase(s, ids, allow).Leave(ctx, staffID, staff.LeaveInput{})
	if err != nil {
		t.Fatal(err)
	}
	if len(got.Schedules) != 1 || got.Schedules[0].ID != "TODAY" || len(got.Recurring) != 1 ||
		len(got.Schedules) != len(left.Assignments.Schedules) || len(got.Recurring) != len(left.Assignments.Recurring) {
		t.Errorf("一覧 = %+v, 休職の一覧 = %+v, want 同じ当日以降の一覧", got, left.Assignments)
	}

	s, ids = stopFixture()
	if _, err := stopUsecase(s, ids, allow).RemainingAssignments(ctx, staffID); err != nil {
		t.Fatal(err)
	}
	if s.Staff[staffID].Status() != staff.StatusActive || ids.Members["broker-1"].Suspended {
		t.Errorf("職員 = %+v, ブローカー = %+v, want 何も書かない", s.Staff[staffID].Staff, ids.Members)
	}
	if _, err := stopUsecase(s, ids, deny).RemainingAssignments(ctx, staffID); !errors.Is(err, apperr.ErrForbidden) {
		t.Errorf("職員の管理の権限が無い: err = %v, want ErrForbidden", err)
	}
	if _, err := stopUsecase(s, ids, allow).RemainingAssignments(ctx, "MISSING"); !errors.Is(err, apperr.ErrNotFound) {
		t.Errorf("無い職員: err = %v, want ErrNotFound", err)
	}
}
