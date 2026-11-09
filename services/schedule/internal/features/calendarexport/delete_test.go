package calendarexport_test

import (
	"errors"
	"net/http"
	"testing"

	calendarv3 "google.golang.org/api/calendar/v3"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendar"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/schedule"
	"github.com/Fukuemon/buddy/services/schedule/internal/inmem"
)

// deletedExport は、削除した単発の予定 id の書き出しの待ちを返す。
func (e exportEnv) deletedExport(t *testing.T, id string) calendar.Export {
	t.Helper()
	for _, x := range e.store.Exports {
		if x.DeletedScheduleID == id {
			return x
		}
	}
	t.Fatalf("削除した予定 %s の書き出しの待ちが無い", id)
	return calendar.Export{}
}

// 単発の予定を削除すると、書き出しは、Google で変わっていても Google の予定を消し、予定の対応を消す（ADR-0040）。
func TestExportDelete(t *testing.T) {
	e := newExportEnv(t)
	d := e.create(t, "カンファレンス")
	e.run(t)
	e.srv.Edit(googleCalID, eventID(t, d.ID), func(ev *calendarv3.Event) { ev.Summary = "Google で変更" })
	if err := e.schedules.Delete(e.ctx, d.ID); err != nil {
		t.Fatal(err)
	}
	l, err := inmem.Calendars{Store: e.store}.LinkByDeletedSchedule(t.Context(), d.ID)
	if err != nil || l.ScheduleID != nil {
		t.Fatalf("削除した直後の対応 = %+v, %v, want 削除した予定を指して残る", l, err)
	}
	if n := e.run(t); n != 1 {
		t.Errorf("書いた待ち = %d, want 削除の 1 件", n)
	}
	if ev := e.srv.Event(googleCalID, eventID(t, d.ID)); ev.Status != "cancelled" {
		t.Errorf("削除した予定の Google の状態 = %s, want cancelled", ev.Status)
	}
	if _, err := (inmem.Calendars{Store: e.store}).LinkByDeletedSchedule(t.Context(), d.ID); !errors.Is(err, apperr.ErrNotFound) {
		t.Errorf("書き出した後の対応のエラー = %v, want ErrNotFound", err)
	}
	if x := e.deletedExport(t, d.ID); x.Status != calendar.ExportSucceeded {
		t.Errorf("待ちの状態 = %s", x.Status)
	}
}

// 書き出しが Google の予定を作った後、予定の対応を書く前に削除しても、予定の ID から決めた Google の予定を消す。
// 一度も書き出していない予定の削除は、Google に予定が無い（404）ので、消せたものとして終える。
func TestExportDeleteWithoutLink(t *testing.T) {
	e := newExportEnv(t)
	written := e.create(t, "カンファレンス")
	e.run(t)
	l, err := inmem.Calendars{Store: e.store}.LinkBySchedule(t.Context(), written.ID)
	if err != nil {
		t.Fatal(err)
	}
	delete(e.store.Links, l.ID)
	never := e.create(t, "未書き出し")
	delete(e.store.Exports, e.export(t, never.ID).ID)
	for _, id := range []string{written.ID, never.ID} {
		if err := e.schedules.Delete(e.ctx, id); err != nil {
			t.Fatal(err)
		}
	}
	if n := e.run(t); n != 2 {
		t.Errorf("書いた待ち = %d, want 削除の 2 件", n)
	}
	if ev := e.srv.Event(googleCalID, eventID(t, written.ID)); ev.Status != "cancelled" {
		t.Errorf("対応の無い Google の予定の状態 = %s, want cancelled", ev.Status)
	}
	for _, id := range []string{written.ID, never.ID} {
		if x := e.deletedExport(t, id); x.Status != calendar.ExportSucceeded {
			t.Errorf("%s の待ちの状態 = %s, want succeeded", id, x.Status)
		}
	}
}

// Google で既に消されていた（410）予定の削除は、消せたものとして予定の対応を消す。
func TestExportDeleteGoneInGoogle(t *testing.T) {
	e := newExportEnv(t)
	d := e.create(t, "カンファレンス")
	e.run(t)
	if err := e.schedules.Delete(e.ctx, d.ID); err != nil {
		t.Fatal(err)
	}
	e.srv.Failures = []int{http.StatusGone}
	e.run(t)
	if x := e.deletedExport(t, d.ID); x.Status != calendar.ExportSucceeded {
		t.Errorf("待ちの状態 = %s, want succeeded", x.Status)
	}
	if _, err := (inmem.Calendars{Store: e.store}).LinkByDeletedSchedule(t.Context(), d.ID); !errors.Is(err, apperr.ErrNotFound) {
		t.Errorf("対応のエラー = %v, want ErrNotFound", err)
	}
}

// 予定の職員がカレンダーを結び付けておらず、予定の対応のカレンダーも外したときは、削除の待ちを積まない。
func TestExportDeleteSkipsDisabledCalendar(t *testing.T) {
	e := newExportEnv(t)
	d := e.create(t, "カンファレンス")
	e.run(t)
	if err := (inmem.Calendars{Store: e.store}).Disable(t.Context(), calID); err != nil {
		t.Fatal(err)
	}
	if err := e.schedules.Delete(e.ctx, d.ID); err != nil {
		t.Fatal(err)
	}
	for _, x := range e.store.Exports {
		if x.DeletedScheduleID == d.ID {
			t.Errorf("削除の待ち = %+v, want 積まない", x)
		}
	}
}

// 繰り返しの予定の回を削除すると、書き出しはその日を親の予定の EXDATE にする。置き換えた回を削除すると、その単発の予定を消す。
func TestExportDeleteOccurrence(t *testing.T) {
	e := newExportEnv(t)
	title := "定例"
	rs, err := e.schedules.CreateRecurring(e.ctx, inmem.FacilityID, schedule.SlotInput{
		TypeID: inmem.NormalTypeID, Date: civil.Date{Year: 2026, Month: 11, Day: 2},
		StartTime: civil.Time{Hour: 9}, EndTime: civil.Time{Hour: 10}, StaffID: inmem.StaffID, Title: &title,
	}, schedule.RuleInput{Frequency: schedule.Weekly})
	if err != nil {
		t.Fatal(err)
	}
	moved := "定例（11/16 は午後）"
	occ, err := e.schedules.ChangeOccurrence(e.ctx, rs.ID, civil.Date{Year: 2026, Month: 11, Day: 16}, schedule.SlotInput{
		TypeID: inmem.NormalTypeID, Date: civil.Date{Year: 2026, Month: 11, Day: 16},
		StartTime: civil.Time{Hour: 14}, EndTime: civil.Time{Hour: 15}, StaffID: inmem.StaffID, Title: &moved,
	})
	if err != nil {
		t.Fatal(err)
	}
	e.run(t)

	if err := e.schedules.DeleteOccurrence(e.ctx, rs.ID, civil.Date{Year: 2026, Month: 11, Day: 9}); err != nil {
		t.Fatal(err)
	}
	if err := e.schedules.Delete(e.ctx, occ.ID); err != nil {
		t.Fatal(err)
	}
	e.run(t)
	ev := e.srv.Event(googleCalID, eventID(t, rs.ID))
	if len(ev.Recurrence) != 2 || ev.Recurrence[1] != "EXDATE;TZID=Asia/Tokyo:20261109T090000,20261116T090000" {
		t.Errorf("回を削除した後の繰り返し = %v", ev.Recurrence)
	}
	if single := e.srv.Event(googleCalID, eventID(t, occ.ID)); single == nil || single.Status != "cancelled" {
		t.Errorf("削除した置き換えた回 = %+v, want cancelled", single)
	}
}
