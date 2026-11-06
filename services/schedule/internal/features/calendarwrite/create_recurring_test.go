package calendarwrite_test

import (
	"errors"
	"maps"
	"slices"
	"testing"
	"time"

	calendarv3 "google.golang.org/api/calendar/v3"

	"github.com/Fukuemon/buddy/packages/go/gcaltitle"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendar"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendarwrite"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/schedule"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/scheduleview"
	"github.com/Fukuemon/buddy/services/schedule/internal/inmem"
)

// weekly は、毎週の繰り返しの規則である。最初の日付（visitSlot の 2026-10-22、木曜）から曜日を決める。
var weekly = schedule.RuleInput{Frequency: schedule.Weekly}

// weeklyRecurrence は、weekly の規則を Google に書いた繰り返しの規則である。
var weeklyRecurrence = []string{"RRULE:FREQ=WEEKLY;BYDAY=TH"}

// occurrenceDates は、Google のフェイクに持たせる繰り返しの予定の回の日付である。
var occurrenceDates = []civil.Date{{Year: 2026, Month: 10, Day: 22}, {Year: 2026, Month: 10, Day: 29}, {Year: 2026, Month: 11, Day: 5}}

// seedRecurring は、訪問の繰り返しの予定を作り、Google のフェイクに、親の予定から occurrenceDates の回を持たせる。
// Google と同じく、回の ID は親の予定の ID と回の開始の UTC の時刻にし、回は親の予定の内容を引き継ぐ。
func (fx *fixture) seedRecurring(t *testing.T) scheduleview.RecurringDetail {
	t.Helper()
	got, err := fx.createRecurring.Do(editorCtx(), inmem.FacilityID, scheduleID, visitSlot(), weekly)
	if err != nil {
		t.Fatal(err)
	}
	parent := fx.google.Event(calendarID, eventID(t))
	if parent == nil {
		t.Fatal("Google カレンダーに繰り返しの予定が無い")
	}
	var items []*calendarv3.Event
	for i, d := range occurrenceDates {
		start := time.Date(d.Year, d.Month, d.Day, 9, 0, 0, 0, calendar.Tokyo)
		items = append(items, &calendarv3.Event{
			Id: instanceID(t, d), Status: "confirmed", Summary: parent.Summary, RecurringEventId: parent.Id, Etag: `"i` + string(rune('1'+i)) + `"`,
			OriginalStartTime:  &calendarv3.EventDateTime{DateTime: start.Format(time.RFC3339), TimeZone: calendar.TimeZone},
			Start:              &calendarv3.EventDateTime{DateTime: start.Format(time.RFC3339), TimeZone: calendar.TimeZone},
			End:                &calendarv3.EventDateTime{DateTime: start.Add(time.Hour).Format(time.RFC3339), TimeZone: calendar.TimeZone},
			ExtendedProperties: &calendarv3.EventExtendedProperties{Private: maps.Clone(parent.ExtendedProperties.Private)},
		})
	}
	fx.google.Instances = map[string][]*calendarv3.Event{parent.Id: items}
	return got
}

// instanceID は、繰り返しの予定 scheduleID の d の回の、Google の予定の ID である。
func instanceID(t *testing.T, d civil.Date) string {
	t.Helper()
	start := time.Date(d.Year, d.Month, d.Day, 9, 0, 0, 0, calendar.Tokyo).UTC()
	return eventID(t) + "_" + start.Format("20060102T150405Z")
}

// TestCreateRecurringVisit は、訪問の繰り返しの予定を作ると、Google カレンダーに RRULE の繰り返しの予定が 1 つでき、
// 親の予定の Projection の行と、訪問の情報を確定した記録ができることを確認する。
func TestCreateRecurringVisit(t *testing.T) {
	fx := newFixture(t)
	got := fx.seedRecurring(t)
	if got.ID != scheduleID || got.Rule.Frequency != schedule.Weekly || got.Visit == nil || got.Visit.PatientName != patientName ||
		got.StaffName != "佐藤" || got.Version != 1 || len(got.ExclusionDates) != 0 {
		t.Errorf("got = %+v, visit = %+v", got, got.Visit)
	}
	events := fx.google.Events(calendarID)
	if len(events) != 1 {
		t.Fatalf("Google の予定 = %d 件, want 繰り返しの予定 1 件", len(events))
	}
	ev := events[0]
	if ev.Id != eventID(t) || !slices.Equal(ev.Recurrence, weeklyRecurrence) || ev.Summary != gcaltitle.Format(serviceCode, patientName) ||
		ev.ExtendedProperties.Private[calendar.PropScheduleID] != scheduleID || ev.ExtendedProperties.Private[calendar.PropVersion] != "1" {
		t.Errorf("Google の予定 = %+v, private = %v", ev, ev.ExtendedProperties.Private)
	}
	p, ok := fx.projection(t)
	if !ok || !p.IsParent() || p.Status != scheduleview.ProjectionConfirmed {
		t.Errorf("Projection = %+v, ok = %v", p, ok)
	}
	r, ok := fx.record(t)
	if !ok || r.Version != 1 || r.Pending != nil || r.VisitInfoID == nil || *r.VisitInfoID != got.Visit.ID {
		t.Errorf("記録 = %+v", r)
	}
}

// TestCreateRecurringRejects は、繰り返しの規則の誤りと、カレンダーの無い職員の繰り返しの予定を、Google に書かずに拒むことを確認する。
func TestCreateRecurringRejects(t *testing.T) {
	fx := newFixture(t)
	day := 1
	_, err := fx.createRecurring.Do(editorCtx(), inmem.FacilityID, scheduleID, visitSlot(), schedule.RuleInput{Frequency: schedule.Weekly, DayOfWeek: &day})
	if !errors.Is(err, apperr.ErrInvalidInput) {
		t.Errorf("最初の日付が回に当たらない: err = %v", err)
	}
	delete(fx.store.Calendars, externalID)
	_, err = fx.createRecurring.Do(editorCtx(), inmem.FacilityID, scheduleID, visitSlot(), weekly)
	if !isConflict(err, calendarwrite.CodeCalendarNotLinked) {
		t.Errorf("カレンダーが無い: err = %v", err)
	}
	if fx.google.Writes() != 0 {
		t.Errorf("Google への書き込み = %d, want 0", fx.google.Writes())
	}
	if _, ok := fx.record(t); ok {
		t.Error("記録が残った")
	}
}
