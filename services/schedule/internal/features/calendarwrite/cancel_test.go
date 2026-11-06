package calendarwrite_test

import (
	"errors"
	"testing"

	calendarv3 "google.golang.org/api/calendar/v3"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendar"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendarwrite"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/scheduleview"
	"github.com/Fukuemon/buddy/services/schedule/internal/inmem"
)

// TestCancel は、buddy で作った予定を取り消すと、Google の予定が消え、Projection の行が取り消しの状態になり、
// 記録と訪問の情報が消えることを確認する。
func TestCancel(t *testing.T) {
	fx := newFixture(t)
	d := fx.created(t)
	got, err := fx.cancel.Do(editorCtx(), inmem.FacilityID, scheduleID, d.ETag, "利用者の都合")
	if err != nil {
		t.Fatal(err)
	}
	if got.ID != scheduleID || got.ScheduleID != scheduleID || got.Reason != "利用者の都合" {
		t.Errorf("取り消し = %+v", got)
	}
	if ev := fx.google.Event(calendarID, eventID(t)); ev.Status != "cancelled" {
		t.Errorf("Google の予定の状態 = %s", ev.Status)
	}
	if p, _ := fx.projection(t); p.Status != scheduleview.ProjectionCancelled {
		t.Errorf("Projection の状態 = %s", p.Status)
	}
	if _, ok := fx.record(t); ok || len(fx.store.Infos) != 0 {
		t.Errorf("記録か訪問の情報が残った: 訪問の情報 = %d 件", len(fx.store.Infos))
	}
}

// TestCancelGoogleEvent は、Google で作った予定を、一覧での予定の ID で取り消せることを確認する。
func TestCancelGoogleEvent(t *testing.T) {
	fx := newFixture(t)
	id, etag := fx.madeInGoogle(t)
	if _, err := fx.cancel.Do(editorCtx(), inmem.FacilityID, id, etag, "中止"); err != nil {
		t.Fatal(err)
	}
	if ev := fx.google.Event(calendarID, googleEventID); ev.Status != "cancelled" {
		t.Errorf("Google の予定の状態 = %s", ev.Status)
	}
	if p := fx.store.Projections[inmem.ProjectionKey{ExternalCalendarID: externalID, EventID: googleEventID}]; p.Status != scheduleview.ProjectionCancelled {
		t.Errorf("Projection の状態 = %s", p.Status)
	}
}

// TestCancelChangedInGoogle は、読んだ後に Google で変えた予定を取り消すと、google_event_changed を返し、Google の予定を消さずに、
// Projection に Google の今の予定を写すことを確認する。
func TestCancelChangedInGoogle(t *testing.T) {
	fx := newFixture(t)
	d := fx.created(t)
	fx.google.Edit(calendarID, eventID(t), func(ev *calendarv3.Event) { ev.Summary = "Google で変えた" })
	if _, err := fx.cancel.Do(editorCtx(), inmem.FacilityID, scheduleID, d.ETag, "中止"); !isConflict(err, calendarwrite.CodeEventChanged) {
		t.Fatalf("err = %v", err)
	}
	if ev := fx.google.Event(calendarID, eventID(t)); ev.Status == "cancelled" {
		t.Errorf("Google の予定が消えた")
	}
	if p, _ := fx.projection(t); p.Title != "Google で変えた" || p.Status != scheduleview.ProjectionConfirmed {
		t.Errorf("Projection = %+v", p)
	}
	if _, ok := fx.record(t); !ok {
		t.Errorf("記録が消えた")
	}
}

// TestCancelRejects は、空の理由、etag の無い入力、保留の版がある予定を、Google に書かずに拒むことを確認する。
func TestCancelRejects(t *testing.T) {
	fx := newFixture(t)
	d := fx.created(t)
	writes := fx.google.Writes()
	if _, err := fx.cancel.Do(editorCtx(), inmem.FacilityID, scheduleID, d.ETag, " "); !errors.Is(err, apperr.ErrInvalidInput) {
		t.Errorf("空の理由: err = %v", err)
	}
	if _, err := fx.cancel.Do(editorCtx(), inmem.FacilityID, scheduleID, "", "中止"); !errors.Is(err, apperr.ErrInvalidInput) {
		t.Errorf("etag が無い: err = %v", err)
	}
	r, _ := fx.record(t)
	r.Pending = &calendar.PendingWrite{Version: 2, State: calendar.PendingUnknown, Deadline: fx.now}
	fx.store.Records[scheduleID] = r
	if _, err := fx.cancel.Do(editorCtx(), inmem.FacilityID, scheduleID, d.ETag, "中止"); !isConflict(err, calendarwrite.CodeWritePending) {
		t.Errorf("保留の版がある予定: err = %v", err)
	}
	if fx.google.Writes() != writes {
		t.Errorf("Google への書き込み = %d, want 0", fx.google.Writes()-writes)
	}
}
