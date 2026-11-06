package calendarwrite_test

import (
	"errors"
	"slices"
	"testing"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendar"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendarwrite"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/schedule"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/scheduleview"
	"github.com/Fukuemon/buddy/services/schedule/internal/inmem"
)

// secondDate は、変える回の元の日付である。
var secondDate = occurrenceDates[1]

// movedSlot は、secondDate の回を 13 時からにした、visitSlot と同じ訪問の情報の入力である。
func movedSlot() schedule.SlotInput {
	in := visitSlot()
	in.Date, in.StartTime, in.EndTime = secondDate, civil.Time{Hour: 13}, civil.Time{Hour: 14}
	return in
}

// exceptionID は、secondDate の回を変えた例外の回の一覧での ID である。
func exceptionID(t *testing.T) string {
	t.Helper()
	return scheduleview.ProjectedScheduleID(externalID, instanceID(t, secondDate))
}

// TestChangeOccurrence は、繰り返しの予定の 1 回を変えると、Google に例外の回ができ、親の予定の EXDATE と記録が変わらないことを確認する。
// 訪問の情報を変えない回は、回の記録を作らず、親の予定の記録の訪問の情報を返す。
func TestChangeOccurrence(t *testing.T) {
	fx := newFixture(t)
	rs := fx.seedRecurring(t)
	parentBefore, _ := fx.record(t)

	got, err := fx.changeOccurrence.Do(editorCtx(), inmem.FacilityID, scheduleID, secondDate, movedSlot())
	if err != nil {
		t.Fatal(err)
	}
	if got.ID != exceptionID(t) || got.StartTime != (civil.Time{Hour: 13}) || got.Visit == nil || got.Visit.ID != rs.Visit.ID || got.ETag == "" {
		t.Errorf("got = %+v, visit = %+v", got, got.Visit)
	}
	ev := fx.google.Event(calendarID, instanceID(t, secondDate))
	if ev == nil || ev.RecurringEventId != eventID(t) || ev.Start.DateTime != "2026-10-29T13:00:00" || ev.Status != "confirmed" {
		t.Fatalf("Google の例外の回 = %+v", ev)
	}
	parent := fx.google.Event(calendarID, eventID(t))
	if !slices.Equal(parent.Recurrence, weeklyRecurrence) {
		t.Errorf("親の予定の繰り返し = %v, want EXDATE の無い %v", parent.Recurrence, weeklyRecurrence)
	}
	if len(fx.google.Events(calendarID)) != 2 {
		t.Errorf("Google の予定 = %d 件, want 親と例外の回の 2 件", len(fx.google.Events(calendarID)))
	}
	if r, _ := fx.record(t); r.Version != parentBefore.Version || r.Pending != nil || *r.VisitInfoID != *parentBefore.VisitInfoID {
		t.Errorf("親の記録 = %+v, want %+v", r, parentBefore)
	}
	if _, ok := fx.store.Records[exceptionID(t)]; ok {
		t.Error("訪問の情報を変えない回に記録ができた")
	}
	p, ok := fx.store.Projections[inmem.ProjectionKey{ExternalCalendarID: externalID, EventID: ev.Id}]
	if !ok || !p.IsException() || p.RecurringEventID != eventID(t) {
		t.Errorf("例外の回の Projection = %+v, ok = %v", p, ok)
	}

	_, err = fx.changeOccurrence.Do(editorCtx(), inmem.FacilityID, scheduleID, secondDate, movedSlot())
	if !errors.Is(err, apperr.ErrConflict) {
		t.Errorf("同じ回を 2 回変える: err = %v", err)
	}
}

// TestChangeOccurrenceVisit は、回の訪問の情報を変えると、回の一覧での ID の記録ができ、Google が受けた版で確定することと、
// 例外の回の行を一覧で読むと、回の記録の訪問の情報になることを確認する。
func TestChangeOccurrenceVisit(t *testing.T) {
	fx := newFixture(t)
	rs := fx.seedRecurring(t)
	in := movedSlot()
	in.Visit.CompanionID = nil

	got, err := fx.changeOccurrence.Do(editorCtx(), inmem.FacilityID, scheduleID, secondDate, in)
	if err != nil {
		t.Fatal(err)
	}
	r, ok := fx.store.Records[exceptionID(t)]
	if !ok || r.Version != 1 || r.Pending != nil || r.VisitInfoID == nil || *r.VisitInfoID == rs.Visit.ID || r.ExternalEventID != instanceID(t, secondDate) {
		t.Fatalf("回の記録 = %+v, ok = %v", r, ok)
	}
	if got.Visit == nil || got.Visit.CompanionID != nil || got.Visit.ID != *r.VisitInfoID {
		t.Errorf("応答の訪問の情報 = %+v", got.Visit)
	}
	ev := fx.google.Event(calendarID, instanceID(t, secondDate))
	if ev.ExtendedProperties.Private[calendar.PropScheduleID] != exceptionID(t) || ev.ExtendedProperties.Private[calendar.PropVersion] != "1" {
		t.Errorf("例外の回の private = %v", ev.ExtendedProperties.Private)
	}
	row, err := inmem.Projections{Store: fx.store}.GetBySchedule(editorCtx(), inmem.FacilityID, exceptionID(t))
	if err != nil || row.Visit == nil || row.Visit.ID != *r.VisitInfoID {
		t.Errorf("例外の回の行 = %+v, err = %v", row, err)
	}
}

// TestChangeOccurrenceRejects は、回に当たらない日、予定の職員を替える入力、繰り返しでない予定、保留の版がある親を、
// 回を Google に書かずに拒むことを確認する。
func TestChangeOccurrenceRejects(t *testing.T) {
	fx := newFixture(t)
	fx.seedRecurring(t)
	writes := fx.google.Writes()

	_, err := fx.changeOccurrence.Do(editorCtx(), inmem.FacilityID, scheduleID, civil.Date{Year: 2026, Month: 10, Day: 30}, movedSlot())
	if !errors.Is(err, apperr.ErrInvalidInput) {
		t.Errorf("回に当たらない日: err = %v", err)
	}
	in := movedSlot()
	in.StaffID = inmem.CompanionID
	in.Visit.AssignedStaffID, in.Visit.CompanionID = inmem.CompanionID, nil
	if _, err := fx.changeOccurrence.Do(editorCtx(), inmem.FacilityID, scheduleID, secondDate, in); !errors.Is(err, apperr.ErrConflict) {
		t.Errorf("予定の職員を替える: err = %v", err)
	}
	if _, err := fx.changeOccurrence.Do(editorCtx(), inmem.FacilityID, "01M3TC5H00QV17BC0J9V3393ZQ", secondDate, movedSlot()); !errors.Is(err, apperr.ErrNotFound) {
		t.Errorf("無い繰り返しの予定: err = %v", err)
	}
	r, _ := fx.record(t)
	r.Pending = &calendar.PendingWrite{Version: 2, State: calendar.PendingUnknown, Deadline: fx.now}
	fx.store.Records[scheduleID] = r
	if _, err := fx.changeOccurrence.Do(editorCtx(), inmem.FacilityID, scheduleID, secondDate, movedSlot()); !isConflict(err, calendarwrite.CodeWritePending) {
		t.Errorf("保留の版がある親: err = %v", err)
	}
	if fx.google.Writes() != writes {
		t.Errorf("Google への書き込み = %d, want %d", fx.google.Writes(), writes)
	}
	if len(fx.store.Infos) != 1 {
		t.Errorf("訪問の情報 = %d 件, want 親の 1 件", len(fx.store.Infos))
	}
}

// TestUpdateAndCancelException は、変えた回（例外の回）を、一覧での ID と etag で Update と Cancel で変えて取り消せることを確認する。
// 取り消した回は、ほかの回を残して Google で取り消され、親の予定の記録は残る。
func TestUpdateAndCancelException(t *testing.T) {
	fx := newFixture(t)
	fx.seedRecurring(t)
	changed, err := fx.changeOccurrence.Do(editorCtx(), inmem.FacilityID, scheduleID, secondDate, movedSlot())
	if err != nil {
		t.Fatal(err)
	}
	in := movedSlot()
	in.StartTime, in.EndTime = civil.Time{Hour: 15}, civil.Time{Hour: 16}
	got, err := fx.update.Do(editorCtx(), inmem.FacilityID, changed.ID, changed.ETag, in)
	if err != nil {
		t.Fatal(err)
	}
	if got.ID != changed.ID || fx.google.Event(calendarID, instanceID(t, secondDate)).Start.DateTime != "2026-10-29T15:00:00" {
		t.Errorf("変えた回の変更 = %+v", got)
	}
	if _, ok := fx.store.Records[changed.ID]; ok {
		t.Error("訪問の情報を変えない回に記録ができた")
	}
	if _, err := fx.cancel.Do(editorCtx(), inmem.FacilityID, changed.ID, got.ETag, "利用者の都合"); err != nil {
		t.Fatal(err)
	}
	if ev := fx.google.Event(calendarID, instanceID(t, secondDate)); ev.Status != "cancelled" {
		t.Errorf("取り消した回の状態 = %s", ev.Status)
	}
	if ev := fx.google.Event(calendarID, eventID(t)); ev.Status != "confirmed" || !slices.Equal(ev.Recurrence, weeklyRecurrence) {
		t.Errorf("親の予定 = %+v", ev)
	}
	if _, ok := fx.record(t); !ok {
		t.Error("親の予定の記録が消えた")
	}
}
