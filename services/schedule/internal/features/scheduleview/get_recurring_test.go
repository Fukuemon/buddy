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

// TestSchedulesGetRecurring は、繰り返しの予定を作った後と回を置き換えた後に、GetRecurring が書いた内容を返すことを確認する。
func TestSchedulesGetRecurring(t *testing.T) {
	s := inmem.Seeded()
	uc := newSchedules(s)
	ctx := editorCtx()

	created, err := uc.CreateRecurring(ctx, facilityID, visitSlot(validVisit()), schedule.RuleInput{Frequency: schedule.Weekly})
	if err != nil {
		t.Fatal(err)
	}
	got, err := uc.GetRecurring(ctx, created.ID)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(got, created) || got.Visit == nil || got.Version != 1 {
		t.Errorf("作った後の GetRecurring = %+v, want %+v", got, created)
	}

	date := civil.Date{Year: 2026, Month: 10, Day: 27}
	if _, err := uc.ChangeOccurrence(ctx, created.ID, date, normalSlot()); err != nil {
		t.Fatal(err)
	}
	got, err = uc.GetRecurring(ctx, created.ID)
	if err != nil {
		t.Fatal(err)
	}
	if !slices.Equal(got.ExclusionDates, []civil.Date{date}) || got.Version != created.Version+1 {
		t.Errorf("回を置き換えた後の ExclusionDates = %v, Version = %d", got.ExclusionDates, got.Version)
	}
	got.ExclusionDates, got.Version = created.ExclusionDates, created.Version
	if !reflect.DeepEqual(got, created) {
		t.Errorf("回を置き換えた後の GetRecurring が、除外した日付と更新の番号のほかに変わった: %+v", got)
	}

	if _, err := uc.GetRecurring(ctx, "MISSING"); !errors.Is(err, apperr.ErrNotFound) {
		t.Errorf("無い繰り返しの予定: err = %v, want ErrNotFound", err)
	}
}
