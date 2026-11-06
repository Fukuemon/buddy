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

// exceptionID は、secondDate の回の一覧での ID である。回を変える前と後で同じである。
func exceptionID(t *testing.T) string {
	t.Helper()
	return scheduleview.OccurrenceScheduleID(externalID, eventID(t), secondDate)
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

// TestChangeOccurrenceRejects は、回に当たらない日、繰り返しでない予定、保留の版がある親を、
// 回を Google に書かずに拒むことを確認する。
func TestChangeOccurrenceRejects(t *testing.T) {
	fx := newFixture(t)
	fx.seedRecurring(t)
	writes := fx.google.Writes()

	_, err := fx.changeOccurrence.Do(editorCtx(), inmem.FacilityID, scheduleID, civil.Date{Year: 2026, Month: 10, Day: 30}, movedSlot())
	if !errors.Is(err, apperr.ErrInvalidInput) {
		t.Errorf("回に当たらない日: err = %v", err)
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

// TestChangeOccurrenceMove は、回の予定の職員を替えると、元のカレンダーの回が取り消され、新しい職員のカレンダーに単発の予定ができ、
// 回の一覧での ID の記録が移した単発の予定を指すことを確認する。応答と移した予定の ID は、回の一覧での ID のままである。
func TestChangeOccurrenceMove(t *testing.T) {
	fx := newFixture(t)
	fx.seedRecurring(t)
	in := movedSlot()
	in.StaffID = inmem.CompanionID
	in.Visit.AssignedStaffID, in.Visit.CompanionID = inmem.CompanionID, nil

	got, err := fx.changeOccurrence.Do(editorCtx(), inmem.FacilityID, scheduleID, secondDate, in)
	if err != nil {
		t.Fatal(err)
	}
	if got.ID != exceptionID(t) || got.StaffID != inmem.CompanionID {
		t.Errorf("got = %+v", got)
	}
	if ev := fx.google.Event(calendarID, instanceID(t, secondDate)); ev == nil || ev.Status != "cancelled" {
		t.Errorf("元のカレンダーの回 = %+v", ev)
	}
	moved := fx.google.Events(calendarID2)
	if len(moved) != 1 || len(moved[0].Recurrence) != 0 || moved[0].Start.DateTime != "2026-10-29T13:00:00" ||
		moved[0].ExtendedProperties.Private[calendar.PropScheduleID] != exceptionID(t) {
		t.Fatalf("新しいカレンダーの予定 = %+v", moved)
	}
	r, ok := fx.store.Records[exceptionID(t)]
	if !ok || r.Version != 1 || r.Pending != nil || r.ExternalCalendarID != externalID2 || r.ExternalEventID != moved[0].Id || r.VisitInfoID == nil {
		t.Errorf("回の記録 = %+v, ok = %v", r, ok)
	}
	if ev := fx.google.Event(calendarID, eventID(t)); !slices.Equal(ev.Recurrence, weeklyRecurrence) {
		t.Errorf("親の予定の繰り返し = %v", ev.Recurrence)
	}
	row, err := inmem.Projections{Store: fx.store}.GetBySchedule(editorCtx(), inmem.FacilityID, exceptionID(t))
	if err != nil || row.ExternalCalendarID != externalID2 || row.IsException() {
		t.Errorf("回の一覧での ID の行 = %+v, err = %v", row, err)
	}
}

// TestUpdateAndCancelListedOccurrence は、一覧での ID と親の予定の etag で、変えていない回を Update と Cancel で変えて取り消せることと、
// 読んだ後に親の予定が Google で変わっていれば、回に書かずに CodeEventChanged を返すことを確認する。
func TestUpdateAndCancelListedOccurrence(t *testing.T) {
	fx := newFixture(t)
	fx.seedRecurring(t)
	parentETag := fx.google.Event(calendarID, eventID(t)).Etag

	if _, err := fx.update.Do(editorCtx(), inmem.FacilityID, exceptionID(t), `"old"`, movedSlot()); !isConflict(err, calendarwrite.CodeEventChanged) {
		t.Errorf("古い親の etag: err = %v", err)
	}
	if ev := fx.google.Event(calendarID, instanceID(t, secondDate)); ev.Start.DateTime != "2026-10-29T09:00:00+09:00" {
		t.Errorf("古い親の etag で回が変わった: %+v", ev.Start)
	}
	got, err := fx.update.Do(editorCtx(), inmem.FacilityID, exceptionID(t), parentETag, movedSlot())
	if err != nil {
		t.Fatal(err)
	}
	if got.ID != exceptionID(t) || fx.google.Event(calendarID, instanceID(t, secondDate)).Start.DateTime != "2026-10-29T13:00:00" {
		t.Errorf("変えた回 = %+v", got)
	}
	if ev := fx.google.Event(calendarID, eventID(t)); !slices.Equal(ev.Recurrence, weeklyRecurrence) {
		t.Errorf("親の予定の繰り返し = %v", ev.Recurrence)
	}

	third := occurrenceDates[2]
	thirdID := scheduleview.OccurrenceScheduleID(externalID, eventID(t), third)
	cn, err := fx.cancel.Do(editorCtx(), inmem.FacilityID, thirdID, parentETag, "利用者の都合")
	if err != nil {
		t.Fatal(err)
	}
	if cn.ScheduleID != thirdID || fx.google.Event(calendarID, instanceID(t, third)).Status != "cancelled" {
		t.Errorf("取り消し = %+v", cn)
	}
	if ev := fx.google.Event(calendarID, instanceID(t, occurrenceDates[0])); ev.Status != "confirmed" {
		t.Errorf("ほかの回 = %+v", ev)
	}

	r, _ := fx.record(t)
	r.Pending = &calendar.PendingWrite{Version: 2, State: calendar.PendingUnknown, Deadline: fx.now}
	fx.store.Records[scheduleID] = r
	if _, err := fx.update.Do(editorCtx(), inmem.FacilityID, exceptionID(t), got.ETag, movedSlot()); !isConflict(err, calendarwrite.CodeWritePending) {
		t.Errorf("親に保留の版がある例外の回の変更: err = %v", err)
	}
}

// TestCancelOccurrenceRejectsParentPending は、親の予定の記録に保留の版があるとき、変えた回（例外の回）と変えていない回の
// cancelSchedule（Cancel.Do）が、updateSchedule と同じく CodeWritePending を返し、Google に書かないことを確認する。
func TestCancelOccurrenceRejectsParentPending(t *testing.T) {
	fx := newFixture(t)
	fx.seedRecurring(t)
	parentETag := fx.google.Event(calendarID, eventID(t)).Etag
	changed, err := fx.update.Do(editorCtx(), inmem.FacilityID, exceptionID(t), parentETag, movedSlot())
	if err != nil {
		t.Fatal(err)
	}
	r, _ := fx.record(t)
	r.Pending = &calendar.PendingWrite{Version: 2, State: calendar.PendingUnknown, Deadline: fx.now}
	fx.store.Records[scheduleID] = r
	writes := fx.google.Writes()

	if _, err := fx.cancel.Do(editorCtx(), inmem.FacilityID, changed.ID, changed.ETag, "利用者の都合"); !isConflict(err, calendarwrite.CodeWritePending) {
		t.Errorf("親に保留の版がある例外の回の取り消し: err = %v", err)
	}
	thirdID := scheduleview.OccurrenceScheduleID(externalID, eventID(t), occurrenceDates[2])
	if _, err := fx.cancel.Do(editorCtx(), inmem.FacilityID, thirdID, parentETag, "利用者の都合"); !isConflict(err, calendarwrite.CodeWritePending) {
		t.Errorf("親に保留の版がある変えていない回の取り消し: err = %v", err)
	}
	if fx.google.Writes() != writes {
		t.Errorf("Google への書き込み = %d, want %d", fx.google.Writes(), writes)
	}
}
