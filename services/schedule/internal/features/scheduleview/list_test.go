package scheduleview_test

import (
	"errors"
	"reflect"
	"slices"
	"testing"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/schedule"
	"github.com/Fukuemon/buddy/services/schedule/internal/inmem"
)

func TestSchedulesList(t *testing.T) {
	s := inmem.Seeded()
	uc := newSchedules(s)
	ctx := editorCtx()
	from, to := civil.Date{Year: 2026, Month: 10, Day: 20}, civil.Date{Year: 2026, Month: 10, Day: 1}
	if _, err := uc.List(ctx, facilityID, schedule.ListQuery{DateFrom: &from, DateTo: &to}); !errors.Is(err, apperr.ErrInvalidInput) {
		t.Fatalf("err = %v, want ErrInvalidInput", err)
	}
	if _, err := uc.List(ctx, "MISSING", schedule.ListQuery{}); !errors.Is(err, apperr.ErrNotFound) {
		t.Fatalf("err = %v, want ErrNotFound", err)
	}
}

// TestSchedulesListContents は、一覧が、事業所の単発の予定と繰り返しの予定を、Get と GetRecurring と同じ枠、種類、更新の番号で返し、ほかの事業所の予定を返さないことを確認する。
func TestSchedulesListContents(t *testing.T) {
	s := inmem.Seeded()
	uc := newSchedules(s)
	ctx := editorCtx()
	single, err := uc.Create(ctx, facilityID, visitSlot(validVisit()))
	if err != nil {
		t.Fatal(err)
	}
	recurring, err := uc.CreateRecurring(ctx, facilityID, normalSlot(), schedule.RuleInput{Frequency: schedule.Weekly})
	if err != nil {
		t.Fatal(err)
	}
	const otherScheduleID, otherRecurringID = "OTHER-SCHEDULE", "OTHER-RECURRING"
	otherSlot := schedule.Slot{FacilityID: otherFacilityID, StaffID: otherStaffID, TypeID: normalTypeID, Date: civil.Date{Year: 2026, Month: 10, Day: 20}}
	s.Schedules[otherScheduleID] = schedule.Detail{Schedule: schedule.Schedule{ID: otherScheduleID, Slot: otherSlot}}
	s.Recurring[otherRecurringID] = schedule.RecurringDetail{RecurringSchedule: schedule.RecurringSchedule{ID: otherRecurringID, Slot: otherSlot}}

	list, err := uc.List(ctx, facilityID, schedule.ListQuery{})
	if err != nil {
		t.Fatal(err)
	}
	if ids := scheduleIDs(list.Schedules); !slices.Equal(ids, []string{single.ID}) {
		t.Errorf("単発の予定 = %v, want [%s]", ids, single.ID)
	}
	for _, d := range list.Schedules {
		want, err := uc.Get(ctx, d.ID)
		if err != nil {
			t.Fatal(err)
		}
		if !reflect.DeepEqual(d.Schedule, want.Schedule) || d.TypeName != want.TypeName || d.Version != want.Version {
			t.Errorf("一覧の予定 = %+v, Get = %+v", d, want)
		}
	}
	ids := make([]string, 0, len(list.RecurringSchedules))
	for _, d := range list.RecurringSchedules {
		ids = append(ids, d.ID)
		want, err := uc.GetRecurring(ctx, d.ID)
		if err != nil {
			t.Fatal(err)
		}
		if !reflect.DeepEqual(d.RecurringSchedule, want.RecurringSchedule) || d.TypeName != want.TypeName || d.Version != want.Version {
			t.Errorf("一覧の繰り返しの予定 = %+v, GetRecurring = %+v", d, want)
		}
	}
	slices.Sort(ids)
	if want := []string{recurring.ID, recurringID}; !slices.Equal(ids, slices.Sorted(slices.Values(want))) {
		t.Errorf("繰り返しの予定 = %v, want %v", ids, want)
	}
}

func scheduleIDs(ds []schedule.Detail) []string {
	ids := make([]string, len(ds))
	for i, d := range ds {
		ids[i] = d.ID
	}
	slices.Sort(ids)
	return ids
}
