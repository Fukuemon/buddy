package calendar_test

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"testing"
	"time"

	calendarv3 "google.golang.org/api/calendar/v3"

	"github.com/Fukuemon/buddy/apps/schedule-api/internal/apperr"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/calendar"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/civil"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/gcal"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/gcal/gcaltest"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/inmem"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/organization"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/principal"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/schedule"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/staff"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/ulid"
)

const otherGoogleCalID = "companion@example.com"

// exportEnv は、予定の操作と、書き出しの処理と、偽物の Calendar API を同じ Store の上で動かす。
type exportEnv struct {
	env
	srv       *gcaltest.Server
	schedules *schedule.Usecase
	exporter  *calendar.Exporter
	// writers は、書き出しの処理が書く手段を引いた事業所の、引いた順の一覧である。
	writers *[]string
}

// writerOf は、事業所によらず w で書く calendar.WriterFor を返し、引かれた事業所を used に足す。
func writerOf(w calendar.EventWriter, used *[]string) calendar.WriterFor {
	return func(_ context.Context, facilityID string) (calendar.EventWriter, error) {
		*used = append(*used, facilityID)
		return w, nil
	}
}

func newExportEnv(t *testing.T) exportEnv {
	t.Helper()
	srv := &gcaltest.Server{Calendars: map[string][][]*calendarv3.Event{googleCalID: {}, otherGoogleCalID: {}}}
	e := newEnv(t, nil)
	s := e.store
	// 外部の予定の ID を予定の ID から決めるので、予定の ID は ULID にする。
	ids := ulid.Generator{}
	e.ctx = principal.With(context.Background(), principal.Principal{Staff: staff.Detail{
		Summary: staff.Summary{Staff: staff.Staff{ID: inmem.StaffID, FacilityID: inmem.FacilityID}},
		Policies: []staff.PolicyGrant{
			{PolicyCode: organization.StaffManage}, {PolicyCode: organization.ScheduleAllEdit},
		},
	}})
	exports := inmem.Exports{Store: s}
	e.uc = calendar.NewUsecase(calendar.Deps{Calendars: inmem.Calendars{Store: s}, Exports: exports}, &inmem.Tx{}, ids, principal.RequireStaffManage)
	sched := schedule.NewUsecase(schedule.Deps{
		Facilities: inmem.Facilities{Store: s}, Staff: inmem.StaffRefs{Store: s}, Visits: nil,
		Schedules: inmem.Schedules{Store: s}, Recurring: inmem.RecurringSchedules{Store: s}, Types: inmem.ScheduleTypes{Store: s},
		Exports: calendar.NewOutbox(exports, inmem.Calendars{Store: s}, ids),
	}, &inmem.Tx{}, ids)
	writers := &[]string{}
	exporter := calendar.NewExporter(calendar.ExporterDeps{
		Exports: exports, Calendars: inmem.Calendars{Store: s}, Writers: writerOf(gcal.NewWriter(gcaltest.Start(t, srv)), writers),
		Schedules: inmem.Schedules{Store: s}, Recurring: inmem.RecurringSchedules{Store: s},
	}, ids, slog.New(slog.NewTextHandler(io.Discard, nil)))
	return exportEnv{env: e, srv: srv, schedules: sched, exporter: exporter, writers: writers}
}

func (e exportEnv) create(t *testing.T, title string) schedule.Detail {
	t.Helper()
	d, err := e.schedules.Create(e.ctx, inmem.FacilityID, schedule.SlotInput{
		TypeID: inmem.NormalTypeID, Date: civil.Date{Year: 2026, Month: 11, Day: 4},
		StartTime: civil.Time{Hour: 10}, EndTime: civil.Time{Hour: 11}, StaffID: inmem.StaffID, Title: &title,
	})
	if err != nil {
		t.Fatal(err)
	}
	return d
}

func (e exportEnv) update(t *testing.T, id, title string, staffID string) {
	t.Helper()
	_, err := e.schedules.Update(e.ctx, id, schedule.SlotInput{
		TypeID: inmem.NormalTypeID, Date: civil.Date{Year: 2026, Month: 11, Day: 5},
		StartTime: civil.Time{Hour: 13}, EndTime: civil.Time{Hour: 14}, StaffID: staffID, Title: &title,
	})
	if err != nil {
		t.Fatal(err)
	}
}

func (e exportEnv) run(t *testing.T) int {
	t.Helper()
	n, err := e.exporter.ExportDue(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	return n
}

// export は、予定 id の最後の書き出しの待ちを返す。
func (e exportEnv) export(t *testing.T, id string) calendar.Export {
	t.Helper()
	var last calendar.Export
	for _, x := range e.store.Exports {
		if (x.ScheduleID == id || x.RecurringScheduleID == id) && (last.ID == "" || x.ID > last.ID) {
			last = x
		}
	}
	if last.ID == "" {
		t.Fatalf("予定 %s の書き出しの待ちが無い", id)
	}
	return last
}

// due は、書き直しを待つ待ちの書く時刻を今にする。
func (e exportEnv) due() {
	for id, x := range e.store.Exports {
		x.NextAttemptAt = time.Now().Add(-time.Second)
		e.store.Exports[id] = x
	}
}

func eventID(t *testing.T, id string) string {
	t.Helper()
	ev, err := calendar.EventIDOf(id)
	if err != nil {
		t.Fatal(err)
	}
	return ev
}

func TestExportCreateUpdateCancel(t *testing.T) {
	e := newExportEnv(t)
	d := e.create(t, "カンファレンス")
	if n := e.run(t); n != 1 {
		t.Fatalf("取った待ち = %d", n)
	}
	ev := e.srv.Event(googleCalID, eventID(t, d.ID))
	if ev == nil || ev.Summary != "カンファレンス" || ev.Start.DateTime != "2026-11-04T10:00:00" || ev.Start.TimeZone != "Asia/Tokyo" {
		t.Fatalf("作った予定 = %+v", ev)
	}
	if ev.ExtendedProperties.Private[calendar.PropScheduleID] != d.ID {
		t.Errorf("private = %v", ev.ExtendedProperties.Private)
	}
	l, err := inmem.Calendars{Store: e.store}.LinkBySchedule(t.Context(), d.ID)
	if err != nil || l.ETag != ev.Etag || l.SyncedVersion == nil || *l.SyncedVersion != 1 {
		t.Fatalf("対応 = %+v, %v", l, err)
	}
	if x := e.export(t, d.ID); x.Status != calendar.ExportSucceeded {
		t.Errorf("待ちの状態 = %s", x.Status)
	}

	e.update(t, d.ID, "カンファレンス（変更）", inmem.StaffID)
	e.run(t)
	ev = e.srv.Event(googleCalID, eventID(t, d.ID))
	if ev.Summary != "カンファレンス（変更）" || ev.Start.DateTime != "2026-11-05T13:00:00" {
		t.Errorf("変えた予定 = %+v", ev)
	}
	l, _ = inmem.Calendars{Store: e.store}.LinkBySchedule(t.Context(), d.ID)
	if l.ETag != ev.Etag || *l.SyncedVersion != 2 {
		t.Errorf("変えた後の対応 = %+v", l)
	}

	if _, err := e.schedules.Cancel(e.ctx, d.ID, "利用者の都合"); err != nil {
		t.Fatal(err)
	}
	e.run(t)
	if ev := e.srv.Event(googleCalID, eventID(t, d.ID)); ev.Status != "cancelled" {
		t.Errorf("キャンセルした予定の状態 = %s", ev.Status)
	}
	if _, err := (inmem.Calendars{Store: e.store}).LinkBySchedule(t.Context(), d.ID); !errors.Is(err, apperr.ErrNotFound) {
		t.Errorf("キャンセルした後の対応の誤り = %v", err)
	}
}

func TestExportSkipsStaffWithoutCalendar(t *testing.T) {
	e := newExportEnv(t)
	delete(e.store.Calendars, calID)
	e.create(t, "カンファレンス")
	if len(e.store.Exports) != 0 {
		t.Fatalf("待ち = %v", e.store.Exports)
	}
	if n := e.run(t); n != 0 || e.srv.Writes() != 0 {
		t.Errorf("取った待ち = %d、書き込み = %d", n, e.srv.Writes())
	}
}

func TestExportSkipsDisabledCalendar(t *testing.T) {
	e := newExportEnv(t)
	d := e.create(t, "カンファレンス")
	e.run(t)
	if err := (inmem.Calendars{Store: e.store}).Disable(t.Context(), calID); err != nil {
		t.Fatal(err)
	}
	writes := e.srv.Writes()
	e.update(t, d.ID, "外した後", inmem.StaffID)
	e.run(t)
	if e.srv.Writes() != writes {
		t.Errorf("外したカレンダーに書いた: %d 回", e.srv.Writes()-writes)
	}
}

func TestExportConflictWhenChangedInGoogle(t *testing.T) {
	e := newExportEnv(t)
	d := e.create(t, "カンファレンス")
	e.run(t)
	// 職員が Google カレンダーで時刻を変えた
	e.srv.Edit(googleCalID, eventID(t, d.ID), func(ev *calendarv3.Event) { ev.Start.DateTime = "2026-11-04T15:00:00" })

	e.update(t, d.ID, "buddy で変更", inmem.StaffID)
	e.run(t)
	x := e.export(t, d.ID)
	if x.Status != calendar.ExportConflict || x.ErrorCode == nil || *x.ErrorCode != calendar.ErrorPreconditionFailed {
		t.Fatalf("待ち = %+v", x)
	}
	if ev := e.srv.Event(googleCalID, eventID(t, d.ID)); ev.Summary != "カンファレンス" || ev.Start.DateTime != "2026-11-04T15:00:00" {
		t.Errorf("Google の予定を書き換えた: %+v", ev)
	}
	issues, err := e.uc.ListExportIssues(e.ctx, inmem.FacilityID)
	if err != nil || len(issues) != 1 || issues[0].ScheduleID != d.ID || issues[0].StaffID != inmem.StaffID || issues[0].Date.Day != 5 {
		t.Fatalf("確かめが要る書き出し = %+v, %v", issues, err)
	}

	// 解くまでは、buddy で変えても書かない
	writes := e.srv.Writes()
	e.update(t, d.ID, "もう一度変更", inmem.StaffID)
	if n := e.run(t); n != 0 || e.srv.Writes() != writes {
		t.Errorf("確かめが要る予定を書いた: 待ち %d、書き込み %d", n, e.srv.Writes()-writes)
	}

	if _, err := e.uc.RetryExport(e.ctx, x.ID); err != nil {
		t.Fatal(err)
	}
	e.run(t)
	if ev := e.srv.Event(googleCalID, eventID(t, d.ID)); ev.Summary != "もう一度変更" || ev.Start.DateTime != "2026-11-05T13:00:00" {
		t.Errorf("書き直した予定 = %+v", ev)
	}
	if x := e.export(t, d.ID); x.Status != calendar.ExportSucceeded || x.Overwrite {
		t.Errorf("書き直した待ち = %+v", x)
	}
	if issues, _ := e.uc.ListExportIssues(e.ctx, inmem.FacilityID); len(issues) != 0 {
		t.Errorf("解いた後の確かめが要る書き出し = %+v", issues)
	}
	var ce *apperr.ConflictError
	if _, err := e.uc.RetryExport(e.ctx, x.ID); !errors.As(err, &ce) || ce.Code != calendar.CodeExportNotInReview {
		t.Errorf("解いた待ちを書き直す誤り = %v", err)
	}
}

func TestExportRecreatesEventDeletedInGoogle(t *testing.T) {
	e := newExportEnv(t)
	d := e.create(t, "カンファレンス")
	e.run(t)
	l, _ := inmem.Calendars{Store: e.store}.LinkBySchedule(t.Context(), d.ID)
	// 職員が Google カレンダーで予定を消した
	if err := gcal.NewWriter(gcaltest.Start(t, e.srv)).Delete(t.Context(), googleCalID, l.ExternalEventID, ""); err != nil {
		t.Fatal(err)
	}
	e.update(t, d.ID, "buddy で変更", inmem.StaffID)
	e.run(t)
	x := e.export(t, d.ID)
	if x.Status != calendar.ExportConflict {
		t.Fatalf("待ち = %+v", x)
	}
	if _, err := e.uc.RetryExport(e.ctx, x.ID); err != nil {
		t.Fatal(err)
	}
	e.run(t)
	if ev := e.srv.Event(googleCalID, eventID(t, d.ID)); ev.Status != "confirmed" || ev.Summary != "buddy で変更" {
		t.Errorf("書き直した予定 = %+v", ev)
	}
}

func TestExportRetriesTransientErrors(t *testing.T) {
	e := newExportEnv(t)
	e.srv.Failures = []int{http.StatusServiceUnavailable, http.StatusTooManyRequests}
	d := e.create(t, "カンファレンス")
	e.run(t)
	x := e.export(t, d.ID)
	if x.Status != calendar.ExportPending || x.Attempts != 1 || *x.ErrorCode != calendar.ErrorUnavailable {
		t.Fatalf("1 回目の後の待ち = %+v", x)
	}
	if wait := time.Until(x.NextAttemptAt); wait < 25*time.Second || wait > 30*time.Second {
		t.Errorf("1 回目の後に待つ時間 = %s", wait)
	}
	if n := e.run(t); n != 0 {
		t.Errorf("書く時刻の前に取った: %d", n)
	}
	e.due()
	e.run(t)
	if x := e.export(t, d.ID); x.Attempts != 2 || time.Until(x.NextAttemptAt) < 55*time.Second {
		t.Errorf("2 回目の後の待ち = %+v", x)
	}
	e.due()
	e.run(t)
	if x := e.export(t, d.ID); x.Status != calendar.ExportSucceeded {
		t.Errorf("3 回目の後の待ち = %+v", x)
	}
	if e.srv.Event(googleCalID, eventID(t, d.ID)) == nil {
		t.Error("予定を作っていない")
	}
}

func TestExportGivesUpAfterMaxAttempts(t *testing.T) {
	e := newExportEnv(t)
	for range calendar.MaxExportAttempts {
		e.srv.Failures = append(e.srv.Failures, http.StatusInternalServerError)
	}
	d := e.create(t, "カンファレンス")
	for range calendar.MaxExportAttempts {
		e.due()
		e.run(t)
	}
	x := e.export(t, d.ID)
	if x.Status != calendar.ExportFailed || x.Attempts != calendar.MaxExportAttempts || *x.ErrorCode != calendar.ErrorUnavailable {
		t.Fatalf("待ち = %+v", x)
	}
	// 上限の後に buddy で変えると、数え直して書く
	e.update(t, d.ID, "変更", inmem.StaffID)
	e.run(t)
	if x := e.export(t, d.ID); x.Status != calendar.ExportSucceeded {
		t.Errorf("変えた後の待ち = %+v", x)
	}
}

func TestExportForbiddenFailsWithoutRetry(t *testing.T) {
	e := newExportEnv(t)
	e.srv.Failures = []int{http.StatusForbidden}
	d := e.create(t, "カンファレンス")
	e.run(t)
	if x := e.export(t, d.ID); x.Status != calendar.ExportFailed || *x.ErrorCode != calendar.ErrorForbidden {
		t.Errorf("待ち = %+v", x)
	}
}

func TestExportMovesEventWhenStaffChanges(t *testing.T) {
	e := newExportEnv(t)
	e.store.Calendars["CAL2"] = calendar.ExternalCalendar{ID: "CAL2", FacilityID: inmem.FacilityID, StaffID: inmem.CompanionID, Provider: calendar.ProviderGoogle, CalendarID: otherGoogleCalID}
	d := e.create(t, "カンファレンス")
	e.run(t)
	e.update(t, d.ID, "担当を替えた", inmem.CompanionID)
	e.run(t)
	if ev := e.srv.Event(googleCalID, eventID(t, d.ID)); ev.Status != "cancelled" {
		t.Errorf("前の職員のカレンダーの予定の状態 = %s", ev.Status)
	}
	if ev := e.srv.Event(otherGoogleCalID, eventID(t, d.ID)); ev == nil || ev.Summary != "担当を替えた" {
		t.Errorf("新しい職員のカレンダーの予定 = %+v", ev)
	}
	l, _ := inmem.Calendars{Store: e.store}.LinkBySchedule(t.Context(), d.ID)
	if l.ExternalCalendarID != "CAL2" {
		t.Errorf("対応のカレンダー = %s", l.ExternalCalendarID)
	}
}

func TestExportUpdatesImportedEvent(t *testing.T) {
	e := newExportEnv(t)
	e.srv.Calendars[googleCalID] = [][]*calendarv3.Event{{gevent("imported", "会議", "2026-11-04T10:00:00+09:00", "2026-11-04T11:00:00+09:00")}}
	d := e.create(t, "会議")
	// 取り込みで書いた対応と同じ形にし、作った待ちは片付ける
	clear(e.store.Exports)
	one := 1
	e.store.Links["L"] = calendar.Link{ID: "L", FacilityID: inmem.FacilityID, ExternalCalendarID: calID, ExternalEventID: "imported", ETag: `"imported"`, SyncedVersion: &one, ScheduleID: &d.ID}

	e.update(t, d.ID, "会議（変更）", inmem.StaffID)
	e.run(t)
	if ev := e.srv.Event(googleCalID, "imported"); ev.Summary != "会議（変更）" {
		t.Errorf("取り込んだ予定 = %+v", ev)
	}
	if e.srv.Event(googleCalID, eventID(t, d.ID)) != nil {
		t.Error("取り込んだ予定とは別の予定を作った")
	}
}

func TestExportRecurringWithReplacedOccurrence(t *testing.T) {
	e := newExportEnv(t)
	title := "定例"
	end := civil.Date{Year: 2026, Month: 12, Day: 31}
	rs, err := e.schedules.CreateRecurring(e.ctx, inmem.FacilityID, schedule.SlotInput{
		TypeID: inmem.NormalTypeID, Date: civil.Date{Year: 2026, Month: 11, Day: 2},
		StartTime: civil.Time{Hour: 9}, EndTime: civil.Time{Hour: 10}, StaffID: inmem.StaffID, Title: &title,
	}, schedule.RuleInput{Frequency: schedule.Weekly, EndDate: &end})
	if err != nil {
		t.Fatal(err)
	}
	e.run(t)
	ev := e.srv.Event(googleCalID, eventID(t, rs.ID))
	if ev == nil || len(ev.Recurrence) != 1 || ev.Recurrence[0] != "RRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=20261231T145959Z" {
		t.Fatalf("繰り返しの予定 = %+v", ev)
	}

	moved := "定例（11/9 は午後）"
	occ, err := e.schedules.ChangeOccurrence(e.ctx, rs.ID, civil.Date{Year: 2026, Month: 11, Day: 9}, schedule.SlotInput{
		TypeID: inmem.NormalTypeID, Date: civil.Date{Year: 2026, Month: 11, Day: 9},
		StartTime: civil.Time{Hour: 14}, EndTime: civil.Time{Hour: 15}, StaffID: inmem.StaffID, Title: &moved,
	})
	if err != nil {
		t.Fatal(err)
	}
	e.run(t)
	ev = e.srv.Event(googleCalID, eventID(t, rs.ID))
	if len(ev.Recurrence) != 2 || ev.Recurrence[1] != "EXDATE;TZID=Asia/Tokyo:20261109T090000" {
		t.Errorf("回を置き換えた後の繰り返し = %v", ev.Recurrence)
	}
	if single := e.srv.Event(googleCalID, eventID(t, occ.ID)); single == nil || single.Start.DateTime != "2026-11-09T14:00:00" {
		t.Errorf("置き換えた回 = %+v", single)
	}
}

func TestExportKeepsLinkWhenGoogleReturnsNotFound(t *testing.T) {
	e := newExportEnv(t)
	d := e.create(t, "カンファレンス")
	e.run(t)
	// 404 は、予定が消されたのか、カレンダーの共有が外れたのかを見分けられない
	e.srv.Failures = []int{http.StatusNotFound}
	e.update(t, d.ID, "buddy で変更", inmem.StaffID)
	e.run(t)
	x := e.export(t, d.ID)
	if x.Status != calendar.ExportConflict || *x.ErrorCode != calendar.ErrorNotFound {
		t.Fatalf("待ち = %+v", x)
	}
	// 書き直しでも 404 なら、対応を消さず、別の予定を作らない
	e.srv.Failures = []int{http.StatusNotFound}
	if _, err := e.uc.RetryExport(e.ctx, x.ID); err != nil {
		t.Fatal(err)
	}
	e.run(t)
	if x := e.export(t, d.ID); x.Status != calendar.ExportConflict {
		t.Fatalf("書き直した待ち = %+v", x)
	}
	if _, err := (inmem.Calendars{Store: e.store}).LinkBySchedule(t.Context(), d.ID); err != nil {
		t.Errorf("404 で対応を消した: %v", err)
	}
	if n := len(e.srv.Events(googleCalID)); n != 1 {
		t.Errorf("Google の予定の数 = %d", n)
	}

	// キャンセルの削除が 404 でも、対応を消さない
	e.srv.Failures = []int{http.StatusNotFound, http.StatusNotFound}
	if _, err := e.uc.RetryExport(e.ctx, x.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := e.schedules.Cancel(e.ctx, d.ID, "中止"); err != nil {
		t.Fatal(err)
	}
	e.run(t)
	if x := e.export(t, d.ID); x.Status != calendar.ExportConflict {
		t.Errorf("キャンセルの待ち = %+v", x)
	}
	if _, err := (inmem.Calendars{Store: e.store}).LinkBySchedule(t.Context(), d.ID); err != nil {
		t.Errorf("キャンセルの 404 で対応を消した: %v", err)
	}
}

func TestExportRecreatesEventGoneInGoogle(t *testing.T) {
	e := newExportEnv(t)
	d := e.create(t, "カンファレンス")
	e.run(t)
	e.srv.Failures = []int{http.StatusGone}
	e.update(t, d.ID, "buddy で変更", inmem.StaffID)
	e.run(t)
	x := e.export(t, d.ID)
	if x.Status != calendar.ExportConflict || *x.ErrorCode != calendar.ErrorNotFound {
		t.Fatalf("待ち = %+v", x)
	}
	// 書き直しで 410 なら、対応を消して作り直す。作り直しは同じ ID の予定に当たり（409）、buddy の内容で更新する
	e.srv.Failures = []int{http.StatusGone}
	if _, err := e.uc.RetryExport(e.ctx, x.ID); err != nil {
		t.Fatal(err)
	}
	e.run(t)
	if x := e.export(t, d.ID); x.Status != calendar.ExportSucceeded {
		t.Fatalf("書き直した待ち = %+v", x)
	}
	if ev := e.srv.Event(googleCalID, eventID(t, d.ID)); ev.Summary != "buddy で変更" {
		t.Errorf("作り直した予定 = %+v", ev)
	}
}

func TestExportMovesFromDisabledCalendarWhenStaffChanges(t *testing.T) {
	e := newExportEnv(t)
	e.store.Calendars["CAL2"] = calendar.ExternalCalendar{ID: "CAL2", FacilityID: inmem.FacilityID, StaffID: inmem.CompanionID, Provider: calendar.ProviderGoogle, CalendarID: otherGoogleCalID}
	d := e.create(t, "カンファレンス")
	e.run(t)
	if err := (inmem.Calendars{Store: e.store}).Disable(t.Context(), calID); err != nil {
		t.Fatal(err)
	}
	e.update(t, d.ID, "担当を替えた", inmem.CompanionID)
	e.run(t)
	if ev := e.srv.Event(googleCalID, eventID(t, d.ID)); ev.Status != "confirmed" {
		t.Errorf("外したカレンダーの予定を消した: %+v", ev)
	}
	if ev := e.srv.Event(otherGoogleCalID, eventID(t, d.ID)); ev == nil || ev.Summary != "担当を替えた" {
		t.Errorf("新しい職員のカレンダーの予定 = %+v", ev)
	}
}

func TestExportRetriesWhenChangedWhileWriting(t *testing.T) {
	e := newExportEnv(t)
	e.srv.Failures = []int{http.StatusForbidden}
	d := e.create(t, "カンファレンス")
	claimed, err := (inmem.Exports{Store: e.store}).Claim(t.Context(), 10, time.Minute)
	if err != nil || len(claimed) != 1 {
		t.Fatalf("Claim = %+v, %v", claimed, err)
	}
	// 書いている間に予定が変わると、失敗の結果を書かずに数え直す
	e.update(t, d.ID, "書いている間に変更", inmem.StaffID)
	if err := (inmem.Exports{Store: e.store}).Finish(t.Context(), claimed[0], calendar.ExportResult{Status: calendar.ExportFailed}); err != nil {
		t.Fatal(err)
	}
	if x := e.export(t, d.ID); x.Status != calendar.ExportPending || x.Attempts != 0 {
		t.Errorf("積み直された待ち = %+v", x)
	}
}

func TestExportDoesNotCountAttemptsOnShutdown(t *testing.T) {
	e := newExportEnv(t)
	d := e.create(t, "カンファレンス")
	ctx, cancel := context.WithCancel(t.Context())
	cancel()
	if _, err := e.exporter.ExportDue(ctx); err != nil {
		t.Logf("止めた後の ExportDue: %v", err)
	}
	if x := e.export(t, d.ID); x.Status != calendar.ExportPending || x.Attempts != 0 {
		t.Errorf("止めた後の待ち = %+v", x)
	}
}

func TestExportAdoptsEventWrittenBeforeLink(t *testing.T) {
	e := newExportEnv(t)
	d := e.create(t, "カンファレンス")
	e.run(t)
	// 作った後に対応を書けなかったときと同じにする
	clear(e.store.Links)
	e.update(t, d.ID, "対応の無いまま変更", inmem.StaffID)
	e.run(t)
	if x := e.export(t, d.ID); x.Status != calendar.ExportSucceeded {
		t.Fatalf("待ち = %+v", x)
	}
	if n := len(e.srv.Events(googleCalID)); n != 1 {
		t.Errorf("Google の予定の数 = %d", n)
	}
	if ev := e.srv.Event(googleCalID, eventID(t, d.ID)); ev.Summary != "対応の無いまま変更" {
		t.Errorf("予定 = %+v", ev)
	}
}

func TestExportCancelConflictWhenChangedInGoogle(t *testing.T) {
	e := newExportEnv(t)
	d := e.create(t, "カンファレンス")
	e.run(t)
	e.srv.Edit(googleCalID, eventID(t, d.ID), func(ev *calendarv3.Event) { ev.Summary = "Google で変更" })
	if _, err := e.schedules.Cancel(e.ctx, d.ID, "中止"); err != nil {
		t.Fatal(err)
	}
	e.run(t)
	if x := e.export(t, d.ID); x.Status != calendar.ExportConflict || *x.ErrorCode != calendar.ErrorPreconditionFailed {
		t.Errorf("待ち = %+v", x)
	}
	if ev := e.srv.Event(googleCalID, eventID(t, d.ID)); ev.Status != "confirmed" {
		t.Errorf("Google で直した予定を消した: %+v", ev)
	}
}

func TestExportRecurringKeepsImportedExceptions(t *testing.T) {
	e := newExportEnv(t)
	moved, skipped := civil.Date{Year: 2026, Month: 11, Day: 9}, civil.Date{Year: 2026, Month: 11, Day: 16}
	const rsID, replacementID = "01K8CCCCCCCCCCCCCCCCCCCCCC", "01K8DDDDDDDDDDDDDDDDDDDDDD"
	title := "定例"
	e.store.Recurring[rsID] = schedule.RecurringDetail{
		RecurringSchedule: schedule.RecurringSchedule{ID: rsID, Slot: schedule.Slot{
			FacilityID: inmem.FacilityID, StaffID: inmem.StaffID, TypeID: inmem.NormalTypeID, Title: &title,
			Date: civil.Date{Year: 2026, Month: 11, Day: 2}, StartTime: civil.Time{Hour: 9}, EndTime: civil.Time{Hour: 10},
		}, Rule: schedule.Rule{Frequency: schedule.Weekly}},
		ExclusionDates: []civil.Date{moved, skipped}, Version: 3,
	}
	rid := rsID
	e.store.Schedules[replacementID] = schedule.Detail{Schedule: schedule.Schedule{
		ID: replacementID, RecurringScheduleID: &rid, OriginalDate: &moved,
		Slot: schedule.Slot{FacilityID: inmem.FacilityID, StaffID: inmem.StaffID, Date: moved},
	}}
	parent := grecurring(gevent("weekly", "定例", "2026-11-02T09:00:00+09:00", "2026-11-02T10:00:00+09:00"), "RRULE:FREQ=WEEKLY;BYDAY=MO")
	e.srv.Calendars[googleCalID] = [][]*calendarv3.Event{{parent,
		gexception("weekly_20261109", "weekly", "定例", "2026-11-09T14:00:00+09:00", "2026-11-09T15:00:00+09:00", "2026-11-09T09:00:00+09:00")}}
	parentEventID, sid := "weekly", replacementID
	e.store.Links["LP"] = calendar.Link{ID: "LP", FacilityID: inmem.FacilityID, ExternalCalendarID: calID, ExternalEventID: "weekly", ETag: `"weekly"`, RecurringScheduleID: &rid}
	e.store.Links["LX"] = calendar.Link{ID: "LX", FacilityID: inmem.FacilityID, ExternalCalendarID: calID, ExternalEventID: "weekly_20261109", RecurringEventID: &parentEventID, ETag: `"weekly_20261109"`, ScheduleID: &sid}
	if err := (inmem.Exports{Store: e.store}).Enqueue(t.Context(), "X1", calendar.Target{FacilityID: inmem.FacilityID, RecurringScheduleID: rsID}); err != nil {
		t.Fatal(err)
	}
	e.run(t)
	ev := e.srv.Event(googleCalID, "weekly")
	// 取り込んだ例外の回が置き換えた 11/9 は EXDATE にせず、buddy で除いた 11/16 だけを EXDATE にする
	if len(ev.Recurrence) != 2 || ev.Recurrence[1] != "EXDATE;TZID=Asia/Tokyo:20261116T090000" {
		t.Errorf("繰り返し = %v", ev.Recurrence)
	}
}

// 書き出しは、要求を受けずに動くので、予定の職員が結び付けたカレンダーの行の事業所のサービスアカウントで書く。
func TestExportUsesCalendarFacilityAccount(t *testing.T) {
	e := newExportEnv(t)
	d := e.create(t, "カンファレンス")
	e.run(t)
	if got := *e.writers; len(got) != 1 || got[0] != inmem.FacilityID {
		t.Fatalf("作るときに引いた事業所 = %v", got)
	}
	// カレンダーの行の事業所で引くことを、予定の事業所と違う値にして確かめる。
	c := e.store.Calendars[calID]
	c.FacilityID = inmem.OtherFacilityID
	e.store.Calendars[calID] = c
	*e.writers = nil
	e.update(t, d.ID, "カンファレンス（変更）", inmem.StaffID)
	e.run(t)
	if got := *e.writers; len(got) != 1 || got[0] != inmem.OtherFacilityID {
		t.Errorf("更新するときに引いた事業所 = %v, want カレンダーの行の事業所", got)
	}
}
