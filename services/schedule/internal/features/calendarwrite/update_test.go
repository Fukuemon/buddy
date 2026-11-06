package calendarwrite_test

import (
	"errors"
	"net/http"
	"testing"

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

// googleEventID は、職員が Google カレンダーで作った予定の ID である。
const googleEventID = "gev1"

// created は、訪問の予定を buddy から作り、作った予定を返す。
func (fx *fixture) created(t *testing.T) scheduleview.Detail {
	t.Helper()
	d, err := fx.create.Do(editorCtx(), inmem.FacilityID, scheduleID, visitSlot())
	if err != nil {
		t.Fatal(err)
	}
	if d.ETag == "" {
		t.Fatal("作成の応答に etag が無い")
	}
	return d
}

// madeInGoogle は、職員が Google カレンダーで作った通常の予定と、同期が写した Projection の行を置き、一覧での予定の ID と etag を返す。
func (fx *fixture) madeInGoogle(t *testing.T) (string, string) {
	t.Helper()
	fx.google.Put(calendarID, &calendarv3.Event{
		Id: googleEventID, Status: "confirmed", Summary: "担当者会議",
		Start: &calendarv3.EventDateTime{DateTime: "2026-10-22T13:00:00+09:00"}, End: &calendarv3.EventDateTime{DateTime: "2026-10-22T14:00:00+09:00"},
	})
	ev := fx.google.Event(calendarID, googleEventID)
	p, err := calendar.ProjectionOf(fx.store.Calendars[externalID], calendar.Event{
		ID: ev.Id, Status: ev.Status, Summary: ev.Summary, ETag: ev.Etag, Updated: ev.Updated,
		Start: calendar.When{DateTime: ev.Start.DateTime}, End: calendar.When{DateTime: ev.End.DateTime},
	})
	if err != nil {
		t.Fatal(err)
	}
	fx.store.Projections[inmem.ProjectionKey{ExternalCalendarID: externalID, EventID: googleEventID}] = p
	return scheduleview.ProjectedScheduleID(externalID, googleEventID), ev.Etag
}

// laterSlot は、visitSlot の時刻を 1 時間後にした入力である。
func laterSlot() schedule.SlotInput {
	in := visitSlot()
	in.StartTime, in.EndTime = civil.Time{Hour: 10}, civil.Time{Hour: 11}
	return in
}

// TestUpdate は、buddy で作った予定を変えると、Google の予定が変わり、記録の版が進み、応答が新しい etag を持つことを確認する。
func TestUpdate(t *testing.T) {
	fx := newFixture(t)
	d := fx.created(t)
	before, _ := fx.record(t)
	got, err := fx.update.Do(editorCtx(), inmem.FacilityID, scheduleID, d.ETag, laterSlot())
	if err != nil {
		t.Fatal(err)
	}
	ev := fx.google.Event(calendarID, eventID(t))
	if ev.Start.DateTime != "2026-10-22T10:00:00" || ev.ExtendedProperties.Private[calendar.PropVersion] != "2" {
		t.Errorf("Google の予定の開始 = %s, private = %v", ev.Start.DateTime, ev.ExtendedProperties.Private)
	}
	if got.ID != scheduleID || got.Version != 2 || got.ETag != ev.Etag || got.StartTime != (civil.Time{Hour: 10}) {
		t.Errorf("応答 = %+v", got)
	}
	r, _ := fx.record(t)
	if r.Version != 2 || r.Pending != nil || r.VisitInfoID == nil || *r.VisitInfoID == *before.VisitInfoID {
		t.Errorf("記録 = %+v", r)
	}
	if _, ok := fx.store.Infos[*before.VisitInfoID]; ok {
		t.Errorf("前の版の訪問の情報が残った")
	}
	if p, _ := fx.projection(t); p.ETag != ev.Etag {
		t.Errorf("Projection の etag = %s, want %s", p.ETag, ev.Etag)
	}
}

// TestUpdateChangedInGoogle は、読んだ後に Google で変えた予定を buddy で変えると、google_event_changed を返し、Google の予定を変えず、
// Projection に Google の今の予定を写し、記録と訪問の情報を前のままにすることを確認する。
func TestUpdateChangedInGoogle(t *testing.T) {
	fx := newFixture(t)
	d := fx.created(t)
	before, _ := fx.record(t)
	fx.google.Edit(calendarID, eventID(t), func(ev *calendarv3.Event) { ev.Summary = "Google で変えた" })
	writes := fx.google.Writes()
	_, err := fx.update.Do(editorCtx(), inmem.FacilityID, scheduleID, d.ETag, laterSlot())
	if !isConflict(err, calendarwrite.CodeEventChanged) {
		t.Fatalf("err = %v", err)
	}
	if ev := fx.google.Event(calendarID, eventID(t)); ev.Summary != "Google で変えた" || ev.Start.DateTime != "2026-10-22T09:00:00" {
		t.Errorf("Google の予定 = %q %s", ev.Summary, ev.Start.DateTime)
	}
	if fx.google.Writes() != writes+1 {
		t.Errorf("Google への書き込み = %d, want If-Match で拒まれた 1 回", fx.google.Writes()-writes)
	}
	if p, _ := fx.projection(t); p.Title != "Google で変えた" {
		t.Errorf("Projection のタイトル = %q", p.Title)
	}
	r, _ := fx.record(t)
	if r.Version != 1 || r.Pending != nil || r.VisitInfoID == nil || *r.VisitInfoID != *before.VisitInfoID || len(fx.store.Infos) != 1 {
		t.Errorf("記録 = %+v, 訪問の情報 = %d 件", r, len(fx.store.Infos))
	}
}

// TestUpdateGoogleEvent は、Google で作った予定に訪問の情報を足して保存すると、一覧での予定の ID を主キーにした記録ができ、
// Google の予定のタイトルが訪問のタイトルになることを確認する。
func TestUpdateGoogleEvent(t *testing.T) {
	fx := newFixture(t)
	id, etag := fx.madeInGoogle(t)
	got, err := fx.update.Do(editorCtx(), inmem.FacilityID, id, etag, visitSlot())
	if err != nil {
		t.Fatal(err)
	}
	if got.ID != id || got.Visit == nil || got.Visit.PatientName != patientName {
		t.Errorf("応答 = %+v", got)
	}
	r, ok := fx.store.Records[id]
	if !ok || r.Version != 1 || r.Pending != nil || r.VisitInfoID == nil || r.ExternalCalendarID != externalID || r.ExternalEventID != googleEventID {
		t.Fatalf("記録 = %+v, ok = %v", r, ok)
	}
	if info := fx.store.Infos[*r.VisitInfoID]; info.PatientID != inmem.PatientID {
		t.Errorf("訪問の情報 = %+v", info)
	}
	ev := fx.google.Event(calendarID, googleEventID)
	if ev.Summary != gcaltitle.Format(serviceCode, patientName) || ev.ExtendedProperties.Private[calendar.PropScheduleID] != id {
		t.Errorf("Google の予定 = %q, private = %v", ev.Summary, ev.ExtendedProperties.Private)
	}
	row, err := inmem.Projections{Store: fx.store}.GetBySchedule(editorCtx(), inmem.FacilityID, id)
	if err != nil || row.EventID != googleEventID || row.ScheduleID != id {
		t.Errorf("同じ ID で引いた行 = %+v, err = %v", row, err)
	}
}

// TestUpdateMovesEvent は、予定の職員（主訪問者）を替えると、前の職員のカレンダーから予定が消え、新しい職員のカレンダーに予定ができ、
// 記録のカレンダーと Google の予定の ID が替わり、同じ予定の ID で新しい予定を引けることを確認する。
func TestUpdateMovesEvent(t *testing.T) {
	fx := newFixture(t)
	d := fx.created(t)
	in := visitSlot()
	in.StaffID, in.Visit.AssignedStaffID, in.Visit.CompanionID = inmem.CompanionID, inmem.CompanionID, nil
	got, err := fx.update.Do(editorCtx(), inmem.FacilityID, scheduleID, d.ETag, in)
	if err != nil {
		t.Fatal(err)
	}
	if ev := fx.google.Event(calendarID, eventID(t)); ev.Status != "cancelled" {
		t.Errorf("前の職員のカレンダーの予定の状態 = %s", ev.Status)
	}
	r, _ := fx.record(t)
	if r.ExternalCalendarID != externalID2 || r.ExternalEventID == eventID(t) || r.Version != 2 || r.Pending != nil {
		t.Fatalf("記録 = %+v", r)
	}
	moved := fx.google.Events(calendarID2)
	if len(moved) != 1 || moved[0].Id != r.ExternalEventID || moved[0].Summary != gcaltitle.Format(serviceCode, patientName) {
		t.Fatalf("新しい職員のカレンダーの予定 = %+v", moved)
	}
	if got.StaffID != inmem.CompanionID || got.ETag != moved[0].Etag {
		t.Errorf("応答 = %+v", got)
	}
	if p, _ := fx.projection(t); p.Status != scheduleview.ProjectionCancelled {
		t.Errorf("前のカレンダーの Projection の状態 = %s", p.Status)
	}
	row, err := inmem.Projections{Store: fx.store}.GetBySchedule(editorCtx(), inmem.FacilityID, scheduleID)
	if err != nil || row.ExternalCalendarID != externalID2 || row.StaffID != inmem.CompanionID {
		t.Errorf("同じ ID で引いた行 = %+v, err = %v", row, err)
	}
}

// TestUpdateMoveChangedInGoogle は、予定を移す前に Google で予定が変わっていれば、どちらのカレンダーにも書かずに google_event_changed を返すことを確認する。
func TestUpdateMoveChangedInGoogle(t *testing.T) {
	fx := newFixture(t)
	d := fx.created(t)
	fx.google.Edit(calendarID, eventID(t), func(ev *calendarv3.Event) { ev.Summary = "Google で変えた" })
	writes := fx.google.Writes()
	in := normalSlot()
	in.StaffID = inmem.CompanionID
	if _, err := fx.update.Do(editorCtx(), inmem.FacilityID, scheduleID, d.ETag, in); !isConflict(err, calendarwrite.CodeEventChanged) {
		t.Fatalf("err = %v", err)
	}
	if fx.google.Writes() != writes || len(fx.google.Events(calendarID2)) != 0 {
		t.Errorf("Google への書き込み = %d, 新しいカレンダーの予定 = %d", fx.google.Writes()-writes, len(fx.google.Events(calendarID2)))
	}
	if r, _ := fx.record(t); r.Pending != nil || r.ExternalCalendarID != externalID {
		t.Errorf("記録 = %+v", r)
	}
}

// TestUpdateFailures は、5xx では保留の版を残し、拒んだことが確かな 412 と 400 では保留の版を消して、記録と訪問の情報を前に戻すことを確認する。
func TestUpdateFailures(t *testing.T) {
	tests := []struct {
		name        string
		status      int
		wantErr     func(error) bool
		wantPending bool
	}{
		{name: "5xx", status: http.StatusInternalServerError, wantErr: func(err error) bool { return errors.Is(err, calendarwrite.ErrWriteUnknown) }, wantPending: true},
		{name: "412", status: http.StatusPreconditionFailed, wantErr: func(err error) bool { return isConflict(err, calendarwrite.CodeEventChanged) }},
		{name: "400", status: http.StatusBadRequest, wantErr: func(err error) bool { return isConflict(err, calendarwrite.CodeEventRejected) }},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			fx := newFixture(t)
			d := fx.created(t)
			before, _ := fx.record(t)
			fx.google.Failures = []int{tt.status}
			if _, err := fx.update.Do(editorCtx(), inmem.FacilityID, scheduleID, d.ETag, laterSlot()); !tt.wantErr(err) {
				t.Fatalf("err = %v", err)
			}
			r, _ := fx.record(t)
			if r.Version != 1 || r.VisitInfoID == nil || *r.VisitInfoID != *before.VisitInfoID {
				t.Fatalf("記録の確定した版 = %+v", r)
			}
			if tt.wantPending {
				if r.Pending == nil || r.Pending.State != calendar.PendingUnknown || r.Pending.Version != 2 || r.Pending.VisitInfoID == nil {
					t.Fatalf("保留の版 = %+v", r.Pending)
				}
				if len(fx.store.Infos) != 2 {
					t.Errorf("訪問の情報 = %d 件, want 確定した版と保留の版の 2 件", len(fx.store.Infos))
				}
				return
			}
			if r.Pending != nil || len(fx.store.Infos) != 1 {
				t.Errorf("保留の版 = %+v, 訪問の情報 = %d 件", r.Pending, len(fx.store.Infos))
			}
		})
	}
}

// TestUpdateRejects は、保留の版がある予定、etag が無い入力、繰り返しの予定、無い予定を、Google に書かずに拒むことを確認する。
func TestUpdateRejects(t *testing.T) {
	fx := newFixture(t)
	d := fx.created(t)
	r, _ := fx.record(t)
	r.Pending = &calendar.PendingWrite{Version: 2, State: calendar.PendingUnknown, Deadline: fx.now}
	fx.store.Records[scheduleID] = r
	writes := fx.google.Writes()
	if _, err := fx.update.Do(editorCtx(), inmem.FacilityID, scheduleID, d.ETag, laterSlot()); !isConflict(err, calendarwrite.CodeWritePending) {
		t.Errorf("保留の版がある予定: err = %v", err)
	}
	if _, err := fx.update.Do(editorCtx(), inmem.FacilityID, scheduleID, "", laterSlot()); !errors.Is(err, apperr.ErrInvalidInput) {
		t.Errorf("etag が無い: err = %v", err)
	}
	if _, err := fx.update.Do(editorCtx(), inmem.FacilityID, "01M3TC5H00QV17BC0J9V3393ZQ", d.ETag, laterSlot()); !errors.Is(err, apperr.ErrNotFound) {
		t.Errorf("無い予定: err = %v", err)
	}
	parentID, etag := fx.madeInGoogle(t)
	k := inmem.ProjectionKey{ExternalCalendarID: externalID, EventID: googleEventID}
	p := fx.store.Projections[k]
	p.Recurrence = []string{"RRULE:FREQ=WEEKLY"}
	fx.store.Projections[k] = p
	if _, err := fx.update.Do(editorCtx(), inmem.FacilityID, parentID, etag, laterSlot()); !errors.Is(err, apperr.ErrConflict) {
		t.Errorf("繰り返しの予定: err = %v", err)
	}
	if fx.google.Writes() != writes {
		t.Errorf("Google への書き込み = %d, want 0", fx.google.Writes()-writes)
	}
}
