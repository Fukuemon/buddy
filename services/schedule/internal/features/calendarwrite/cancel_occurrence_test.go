package calendarwrite_test

import (
	"errors"
	"slices"
	"testing"
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendar"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/scheduleview"
	"github.com/Fukuemon/buddy/services/schedule/internal/inmem"
)

// TestCancelOccurrence は、繰り返しの予定の 1 回を取り消すと、Google のその回が取り消され、ほかの回と親の予定の EXDATE が残り、
// 取り消した回の Projection の行ができることを確認する。同じ回は 2 回取り消せない。
func TestCancelOccurrence(t *testing.T) {
	fx := newFixture(t)
	fx.seedRecurring(t)

	got, err := fx.cancelOccurrence.Do(editorCtx(), inmem.FacilityID, scheduleID, secondDate, "利用者の都合")
	if err != nil {
		t.Fatal(err)
	}
	if got.ScheduleID != exceptionID(t) {
		t.Errorf("取り消し = %+v, want 予定の ID %s", got, exceptionID(t))
	}
	if ev := fx.google.Event(calendarID, instanceID(t, secondDate)); ev == nil || ev.Status != "cancelled" {
		t.Errorf("取り消した回 = %+v", ev)
	}
	reader, _ := accounts{fx.svc}.Source(editorCtx(), inmem.FacilityID)
	from := time.Date(2026, 10, 1, 0, 0, 0, 0, calendar.Tokyo)
	instances, err := reader.Instances(editorCtx(), calendarID, eventID(t), from, from.AddDate(0, 2, 0))
	if err != nil {
		t.Fatal(err)
	}
	var left []civil.Date
	for _, ev := range instances {
		d, _ := calendar.OriginalDate(ev)
		left = append(left, d)
	}
	if want := []civil.Date{occurrenceDates[0], occurrenceDates[2]}; !slices.Equal(left, want) {
		t.Errorf("残った回 = %v, want %v", left, want)
	}
	if ev := fx.google.Event(calendarID, eventID(t)); ev.Status != "confirmed" || !slices.Equal(ev.Recurrence, weeklyRecurrence) {
		t.Errorf("親の予定 = %+v", ev)
	}
	p, ok := fx.store.Projections[inmem.ProjectionKey{ExternalCalendarID: externalID, EventID: instanceID(t, secondDate)}]
	if !ok || p.Status != scheduleview.ProjectionCancelled || !p.IsException() {
		t.Errorf("取り消した回の Projection = %+v, ok = %v", p, ok)
	}
	if _, ok := fx.record(t); !ok {
		t.Error("親の予定の記録が消えた")
	}

	_, err = fx.cancelOccurrence.Do(editorCtx(), inmem.FacilityID, scheduleID, secondDate, "利用者の都合")
	if !errors.Is(err, apperr.ErrInvalidInput) {
		t.Errorf("取り消した回をもう一度取り消す: err = %v", err)
	}
}
