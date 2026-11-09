package schedule_test

import (
	"errors"
	"slices"
	"testing"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/schedule"
	"github.com/Fukuemon/buddy/services/schedule/internal/inmem"
)

func TestSchedulesCreateRecurring(t *testing.T) {
	s := inmem.Seeded()
	uc, _ := newSchedules(s)
	got, err := uc.CreateRecurring(editorCtx(), facilityID, normalSlot(),
		schedule.RuleInput{Frequency: schedule.Weekly, DaysOfWeek: []int{2}})
	if err != nil {
		t.Fatal(err)
	}
	if got.Rule.Frequency != schedule.Weekly || !slices.Equal(got.Rule.DaysOfWeek, []int{2}) || got.Rule.Interval != 1 {
		t.Errorf("Rule = %+v", got.Rule)
	}

	_, err = uc.CreateRecurring(editorCtx(), facilityID, normalSlot(),
		schedule.RuleInput{Frequency: schedule.Monthly, DayOfWeek: ptr(2)})
	if !errors.Is(err, apperr.ErrInvalidInput) {
		t.Fatalf("err = %v, want ErrInvalidInput", err)
	}
}
