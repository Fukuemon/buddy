package schedule_test

import (
	"errors"
	"reflect"
	"testing"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/inmem"
)

// TestSchedulesGet は、予定を作り、変え、キャンセルし、繰り返しの予定の回を置き換えた後に、Get が書いた操作の応答と同じ予定を返すことを確認する。
func TestSchedulesGet(t *testing.T) {
	s := inmem.Seeded()
	uc, _ := newSchedules(s)
	ctx := editorCtx()

	created, err := uc.Create(ctx, facilityID, visitSlot(validVisit()))
	if err != nil {
		t.Fatal(err)
	}
	got, err := uc.Get(ctx, created.ID)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(got, created) || got.Visit == nil || got.TypeName == "" || got.Version != 1 {
		t.Errorf("作った後の Get = %+v, want %+v", got, created)
	}

	in := visitSlot(validVisit())
	in.StartTime, in.EndTime = civil.Time{Hour: 10}, civil.Time{Hour: 11}
	updated, err := uc.Update(ctx, created.ID, in)
	if err != nil {
		t.Fatal(err)
	}
	got, err = uc.Get(ctx, created.ID)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(got, updated) || got.StartTime != in.StartTime || got.Version != 2 {
		t.Errorf("変えた後の Get = %+v, want %+v", got, updated)
	}

	c, err := uc.Cancel(ctx, created.ID, "体調不良")
	if err != nil {
		t.Fatal(err)
	}
	got, err = uc.Get(ctx, created.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.Cancel == nil || *got.Cancel != c || got.Version != updated.Version+1 {
		t.Errorf("キャンセルした後の Cancel = %v, Version = %d, want %+v, %d", got.Cancel, got.Version, c, updated.Version+1)
	}
	got.Cancel, got.Version = nil, updated.Version
	if !reflect.DeepEqual(got, updated) {
		t.Errorf("キャンセルした後の Get が、キャンセルと更新の番号のほかに変わった: %+v", got)
	}

	replaced, err := uc.ChangeOccurrence(ctx, recurringID, civil.Date{Year: 2026, Month: 10, Day: 12}, normalSlot())
	if err != nil {
		t.Fatal(err)
	}
	got, err = uc.Get(ctx, replaced.ID)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(got, replaced) || got.RecurringScheduleID == nil || *got.RecurringScheduleID != recurringID {
		t.Errorf("回を置き換えた後の Get = %+v, want %+v", got, replaced)
	}

	if _, err := uc.Get(ctx, "MISSING"); !errors.Is(err, apperr.ErrNotFound) {
		t.Errorf("無い予定: err = %v, want ErrNotFound", err)
	}
}
