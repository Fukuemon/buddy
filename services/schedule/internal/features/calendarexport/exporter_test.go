package calendarexport_test

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"testing"
	"time"

	calendarv3 "google.golang.org/api/calendar/v3"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendar"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendarexport"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/schedule"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/scheduleview"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/staff"
	"github.com/Fukuemon/buddy/services/schedule/internal/gcal"
	"github.com/Fukuemon/buddy/services/schedule/internal/gcal/gcaltest"
	"github.com/Fukuemon/buddy/services/schedule/internal/inmem"
	"github.com/Fukuemon/buddy/services/schedule/internal/principal"
	"github.com/Fukuemon/buddy/services/schedule/internal/ulid"
)

const (
	calID            = "CAL"
	googleCalID      = "staff@example.com"
	otherGoogleCalID = "companion@example.com"
)

func gevent(id, summary, start, end string) *calendarv3.Event {
	return &calendarv3.Event{
		Id: id, Status: "confirmed", Summary: summary, Etag: `"` + id + `"`,
		Start: &calendarv3.EventDateTime{DateTime: start},
		End:   &calendarv3.EventDateTime{DateTime: end},
	}
}

func gexception(id, parent, summary, start, end, original string) *calendarv3.Event {
	ev := gevent(id, summary, start, end)
	ev.RecurringEventId = parent
	ev.OriginalStartTime = &calendarv3.EventDateTime{DateTime: original}
	return ev
}

func grecurring(ev *calendarv3.Event, rrule ...string) *calendarv3.Event {
	ev.Recurrence = rrule
	return ev
}

// exportEnv は、予定の操作と、書き出しの処理と、フェイクの Calendar API を同じ Store の上で動かす。
type exportEnv struct {
	store     *inmem.Store
	ctx       context.Context
	uc        exportOps
	srv       *gcaltest.Server
	schedules scheduleOps
	exporter  *calendarexport.Exporter
	// writers は、書き出しの処理が書く手段を引いた事業所の、引いた順の一覧である。
	writers *[]string
	// logs は、書き出しの処理が Debug から書いた JSON のログである。
	logs *bytes.Buffer
}

// exportOps は、書き出しのテストが呼ぶ calendarexport の操作の Do である。
type exportOps struct {
	ListExportIssues func(ctx context.Context, facilityID string) ([]calendar.ExportIssue, error)
	RetryExport      func(ctx context.Context, id string) (calendar.Export, error)
}

// scheduleOps は、書き出しのテストが呼ぶ schedule の操作の Do である。
type scheduleOps struct {
	Create           func(ctx context.Context, facilityID string, in schedule.SlotInput) (schedule.Schedule, error)
	CreateRecurring  func(ctx context.Context, facilityID string, in schedule.SlotInput, rule schedule.RuleInput) (schedule.RecurringSchedule, error)
	ChangeOccurrence func(ctx context.Context, recurringScheduleID string, originalDate civil.Date, in schedule.SlotInput) (schedule.Schedule, error)
	ChangeRule       func(ctx context.Context, recurringScheduleID string, effective, firstWeek *civil.Date, rule schedule.RuleInput) (schedule.RecurringSchedule, error)
	Cancel           func(ctx context.Context, scheduleID, reason string) (schedule.Cancellation, error)
	CancelOccurrence func(ctx context.Context, recurringScheduleID string, originalDate civil.Date, reason string) (schedule.Cancellation, error)
	Update           func(ctx context.Context, scheduleID string, in schedule.SlotInput) (schedule.Schedule, error)
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
	s := inmem.Seeded()
	s.Calendars[calID] = calendar.ExternalCalendar{ID: calID, FacilityID: inmem.FacilityID, StaffID: inmem.StaffID, Provider: calendar.ProviderGoogle, CalendarID: googleCalID}
	// 外部の予定の ID を予定の ID から決めるので、予定の ID は ULID にする。
	ids := ulid.Generator{}
	ctx := principal.With(context.Background(), principal.Principal{Staff: principal.Staff{
		ID: inmem.StaffID, FacilityID: inmem.FacilityID,
		Policies: []staff.PolicyGrant{
			{PolicyCode: organization.StaffManage}, {PolicyCode: organization.ScheduleAllEdit},
		},
	}})
	exports := inmem.Exports{Store: s}
	uc := exportOps{
		ListExportIssues: calendarexport.NewListExportIssues(exports, principal.RequireStaffManage).Do,
		RetryExport:      calendarexport.NewRetryExport(exports, principal.RequireStaffManage).Do,
	}
	facilities, refs, schedules, recurring, types := inmem.Facilities{Store: s}, inmem.StaffRefs{Store: s}, inmem.Schedules{Store: s}, inmem.RecurringSchedules{Store: s}, inmem.ScheduleTypes{Store: s}
	outbox, tx := calendarexport.NewOutbox(inmem.Facilities{Store: s}, exports, inmem.Calendars{Store: s}, ids), &inmem.Tx{}
	sched := scheduleOps{
		Create:           schedule.NewCreate(facilities, schedules, types, refs, facilities, nil, nil, outbox, tx, ids).Do,
		CreateRecurring:  schedule.NewCreateRecurring(facilities, types, refs, facilities, nil, nil, recurring, outbox, tx, ids).Do,
		ChangeOccurrence: schedule.NewChangeOccurrence(recurring, refs, facilities, schedules, types, nil, nil, outbox, tx, ids).Do,
		// 規則の変更は今日より前の回を変えないので、今日を 2026-11-04 に決める
		ChangeRule:       schedule.NewChangeRule(recurring, refs, facilities, types, nil, func() time.Time { return civil.Date{Year: 2026, Month: 11, Day: 4}.Time().Add(9 * time.Hour) }, outbox, tx, ids).Do,
		Cancel:           schedule.NewCancel(schedules, refs, facilities, outbox, tx, ids).Do,
		CancelOccurrence: schedule.NewCancelOccurrence(recurring, refs, facilities, schedules, types, nil, outbox, tx, ids).Do,
		Update:           schedule.NewUpdate(schedules, refs, facilities, types, nil, nil, outbox, tx).Do,
	}
	writers, logs := &[]string{}, &bytes.Buffer{}
	exporter := calendarexport.NewExporter(calendarexport.ExporterDeps{
		Facilities: inmem.Facilities{Store: s},
		Exports:    exports, Calendars: inmem.Calendars{Store: s}, Writers: writerOf(gcal.NewWriter(gcaltest.Start(t, srv)), writers),
		Schedules: inmem.Schedules{Store: s}, Recurring: inmem.RecurringSchedules{Store: s},
	}, ids, slog.New(slog.NewJSONHandler(logs, &slog.HandlerOptions{Level: slog.LevelDebug})))
	return exportEnv{store: s, ctx: ctx, uc: uc, srv: srv, schedules: sched, exporter: exporter, writers: writers, logs: logs}
}

func (e exportEnv) create(t *testing.T, title string) schedule.Schedule {
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
		t.Errorf("キャンセルした後の対応のエラー = %v", err)
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
		t.Fatalf("確認が必要な書き出し = %+v, %v", issues, err)
	}

	// 解くまでは、buddy で変えても書かない
	writes := e.srv.Writes()
	e.update(t, d.ID, "もう一度変更", inmem.StaffID)
	if n := e.run(t); n != 0 || e.srv.Writes() != writes {
		t.Errorf("確認が必要な予定を書いた: 待ち %d、書き込み %d", n, e.srv.Writes()-writes)
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
		t.Errorf("解いた後の確認が必要な書き出し = %+v", issues)
	}
	var ce *apperr.ConflictError
	if _, err := e.uc.RetryExport(e.ctx, x.ID); !errors.As(err, &ce) || ce.Code != calendar.CodeExportNotInReview {
		t.Errorf("解いた待ちを書き直すエラー = %v", err)
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
	// Google は消された予定への If-Match の更新に 412 を返すが、変わったではなく消されたとして出す
	x := e.export(t, d.ID)
	if x.Status != calendar.ExportConflict || *x.ErrorCode != calendar.ErrorNotFound {
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

// TestExportRetriesTransientErrors は、503（書いたかが分からない calendar.ErrOutcomeUnknown）と 429（拒まれた calendar.ErrUnavailable）の
// どちらの待ちも、書き直す時刻を持って書き直すことを確認する。
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
	for range calendarexport.MaxExportAttempts {
		e.srv.Failures = append(e.srv.Failures, http.StatusInternalServerError)
	}
	d := e.create(t, "カンファレンス")
	for range calendarexport.MaxExportAttempts {
		e.due()
		e.run(t)
	}
	x := e.export(t, d.ID)
	if x.Status != calendar.ExportFailed || x.Attempts != calendarexport.MaxExportAttempts || *x.ErrorCode != calendar.ErrorUnavailable {
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

func TestExportMovesEventDeletedInGoogleWhenStaffChanges(t *testing.T) {
	e := newExportEnv(t)
	e.store.Calendars["CAL2"] = calendar.ExternalCalendar{ID: "CAL2", FacilityID: inmem.FacilityID, StaffID: inmem.CompanionID, Provider: calendar.ProviderGoogle, CalendarID: otherGoogleCalID}
	d := e.create(t, "カンファレンス")
	e.run(t)
	// 職員が Google カレンダーで予定を消した後に、buddy で職員を替えた
	e.srv.Delete(googleCalID, eventID(t, d.ID))
	e.update(t, d.ID, "担当を替えた", inmem.CompanionID)
	e.run(t)
	if x := e.export(t, d.ID); x.Status != calendar.ExportSucceeded {
		t.Errorf("待ち = %+v", x)
	}
	if ev := e.srv.Event(otherGoogleCalID, eventID(t, d.ID)); ev == nil || ev.Summary != "担当を替えた" {
		t.Errorf("新しい職員のカレンダーの予定 = %+v", ev)
	}
	if l, _ := (inmem.Calendars{Store: e.store}).LinkBySchedule(t.Context(), d.ID); l.ExternalCalendarID != "CAL2" {
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
	e.store.Links["L"] = calendar.EventLink{ID: "L", FacilityID: inmem.FacilityID, ExternalCalendarID: calID, ExternalEventID: "imported", ETag: `"imported"`, SyncedVersion: &one, ScheduleID: &d.ID}

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
	if ev == nil || len(ev.Recurrence) != 1 || ev.Recurrence[0] != "RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=MO;WKST=SU;UNTIL=20261231T145959Z" {
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

// TestExportRecurringWithCancelledOccurrence は、繰り返しの予定の 1 回をキャンセルすると、書き出しがその日を親の予定の EXDATE にし、
// キャンセルした回の単発の予定を Google カレンダーに作らないことを確認する。
func TestExportRecurringWithCancelledOccurrence(t *testing.T) {
	e := newExportEnv(t)
	title := "定例"
	rs, err := e.schedules.CreateRecurring(e.ctx, inmem.FacilityID, schedule.SlotInput{
		TypeID: inmem.NormalTypeID, Date: civil.Date{Year: 2026, Month: 11, Day: 2},
		StartTime: civil.Time{Hour: 9}, EndTime: civil.Time{Hour: 10}, StaffID: inmem.StaffID, Title: &title,
	}, schedule.RuleInput{Frequency: schedule.Weekly})
	if err != nil {
		t.Fatal(err)
	}
	e.run(t)

	c, err := e.schedules.CancelOccurrence(e.ctx, rs.ID, civil.Date{Year: 2026, Month: 11, Day: 9}, "休み")
	if err != nil {
		t.Fatal(err)
	}
	if n := e.run(t); n != 1 {
		t.Errorf("書いた待ち = %d, want 繰り返しの予定の 1 件", n)
	}
	ev := e.srv.Event(googleCalID, eventID(t, rs.ID))
	if len(ev.Recurrence) != 2 || ev.Recurrence[1] != "EXDATE;TZID=Asia/Tokyo:20261109T090000" {
		t.Errorf("回をキャンセルした後の繰り返し = %v", ev.Recurrence)
	}
	if single := e.srv.Event(googleCalID, eventID(t, c.ScheduleID)); single != nil {
		t.Errorf("キャンセルした回の単発の予定 = %+v, want 作らない", single)
	}
}

// 繰り返しの予定の規則を適用の日以降について変えると、書き出しは、元の繰り返しの予定の RRULE を適用の日の前の日で終え、
// 新しい規則の繰り返しの予定を Google に作る。適用の日以降の置き換えた回の単発の予定は残る（ADR-0037）。
func TestExportRecurringRuleChange(t *testing.T) {
	e := newExportEnv(t)
	title := "定例"
	end := civil.Date{Year: 2026, Month: 12, Day: 31}
	monday, tuesday := 1, 2
	rs, err := e.schedules.CreateRecurring(e.ctx, inmem.FacilityID, schedule.SlotInput{
		TypeID: inmem.NormalTypeID, Date: civil.Date{Year: 2026, Month: 11, Day: 2},
		StartTime: civil.Time{Hour: 9}, EndTime: civil.Time{Hour: 10}, StaffID: inmem.StaffID, Title: &title,
	}, schedule.RuleInput{Frequency: schedule.Weekly, DaysOfWeek: []int{monday}, EndDate: &end})
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

	effective := civil.Date{Year: 2026, Month: 11, Day: 10}
	next, err := e.schedules.ChangeRule(e.ctx, rs.ID, &effective, nil, schedule.RuleInput{Frequency: schedule.Weekly, DaysOfWeek: []int{tuesday}, EndDate: &end})
	if err != nil {
		t.Fatal(err)
	}
	for _, id := range []string{rs.ID, next.ID} {
		if x := e.export(t, id); x.Status != calendar.ExportPending {
			t.Errorf("繰り返しの予定 %s の書き出しの待ち = %+v, want 待ち", id, x)
		}
	}
	e.run(t)

	if ev := e.srv.Event(googleCalID, eventID(t, rs.ID)); ev == nil || ev.Recurrence[0] != "RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=MO;WKST=SU;UNTIL=20261109T145959Z" {
		t.Errorf("元の繰り返しの予定 = %+v, want 11-09 までの毎週月曜", ev)
	}
	ev := e.srv.Event(googleCalID, eventID(t, next.ID))
	if ev == nil || ev.Recurrence[0] != "RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=TU;WKST=SU;UNTIL=20261231T145959Z" || ev.Start.DateTime != "2026-11-10T09:00:00" {
		t.Errorf("新しい繰り返しの予定 = %+v, want 11-10 からの毎週火曜", ev)
	}
	if single := e.srv.Event(googleCalID, eventID(t, occ.ID)); single == nil || single.Start.DateTime != "2026-11-16T14:00:00" {
		t.Errorf("置き換えた回 = %+v, want 残る", single)
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

func TestExportCancelEventDeletedInGoogle(t *testing.T) {
	e := newExportEnv(t)
	d := e.create(t, "カンファレンス")
	e.run(t)
	// 職員が Google カレンダーで予定を消した後に、buddy でキャンセルした
	e.srv.Delete(googleCalID, eventID(t, d.ID))
	if _, err := e.schedules.Cancel(e.ctx, d.ID, "中止"); err != nil {
		t.Fatal(err)
	}
	e.run(t)
	if x := e.export(t, d.ID); x.Status != calendar.ExportSucceeded {
		t.Errorf("待ち = %+v", x)
	}
	if _, err := (inmem.Calendars{Store: e.store}).LinkBySchedule(t.Context(), d.ID); !errors.Is(err, apperr.ErrNotFound) {
		t.Errorf("予定の対応が残った: %v", err)
	}
	if issues, _ := e.uc.ListExportIssues(e.ctx, inmem.FacilityID); len(issues) != 0 {
		t.Errorf("確認が必要な書き出し = %+v", issues)
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
	e.store.Recurring[rsID] = scheduleview.RecurringDetail{
		RecurringSchedule: schedule.RecurringSchedule{ID: rsID, Slot: schedule.Slot{
			FacilityID: inmem.FacilityID, StaffID: inmem.StaffID, TypeID: inmem.NormalTypeID, Title: &title,
			Date: civil.Date{Year: 2026, Month: 11, Day: 2}, StartTime: civil.Time{Hour: 9}, EndTime: civil.Time{Hour: 10},
		}, Rule: schedule.Rule{Frequency: schedule.Weekly}},
		ExclusionDates: []civil.Date{moved, skipped}, Version: 3,
	}
	rid := rsID
	e.store.Schedules[replacementID] = scheduleview.Detail{Schedule: schedule.Schedule{
		ID: replacementID, RecurringScheduleID: &rid, OriginalDate: &moved,
		Slot: schedule.Slot{FacilityID: inmem.FacilityID, StaffID: inmem.StaffID, Date: moved},
	}}
	parent := grecurring(gevent("weekly", "定例", "2026-11-02T09:00:00+09:00", "2026-11-02T10:00:00+09:00"), "RRULE:FREQ=WEEKLY;BYDAY=MO")
	e.srv.Calendars[googleCalID] = [][]*calendarv3.Event{{parent,
		gexception("weekly_20261109", "weekly", "定例", "2026-11-09T14:00:00+09:00", "2026-11-09T15:00:00+09:00", "2026-11-09T09:00:00+09:00")}}
	parentEventID, sid := "weekly", replacementID
	e.store.Links["LP"] = calendar.EventLink{ID: "LP", FacilityID: inmem.FacilityID, ExternalCalendarID: calID, ExternalEventID: "weekly", ETag: `"weekly"`, RecurringScheduleID: &rid}
	e.store.Links["LX"] = calendar.EventLink{ID: "LX", FacilityID: inmem.FacilityID, ExternalCalendarID: calID, ExternalEventID: "weekly_20261109", RecurringEventID: &parentEventID, ETag: `"weekly_20261109"`, ScheduleID: &sid}
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

// 書き出しは、リクエストを受けずに動くので、予定の職員が結び付けたカレンダーの行の事業所のサービスアカウントで書く。
// カレンダーの行の事業所を予定の事業所と違う値にして、作る、変える、消すの全てがその事業所で引くことを確認する。
func TestExportUsesCalendarFacilityAccount(t *testing.T) {
	e := newExportEnv(t)
	c := e.store.Calendars[calID]
	c.FacilityID = inmem.OtherFacilityID
	e.store.Calendars[calID] = c
	want := func(op string) {
		t.Helper()
		if got := *e.writers; len(got) != 1 || got[0] != inmem.OtherFacilityID {
			t.Errorf("%sときに引いた事業所 = %v, want カレンダーの行の事業所", op, got)
		}
		*e.writers = nil
	}
	d := e.create(t, "カンファレンス")
	e.run(t)
	want("作る")
	e.update(t, d.ID, "カンファレンス（変更）", inmem.StaffID)
	e.run(t)
	want("変える")
	if _, err := e.schedules.Cancel(e.ctx, d.ID, "中止"); err != nil {
		t.Fatal(err)
	}
	e.run(t)
	want("消す")
}

// logged は、ログのうち msg の行を、書いた順に返す。行が無ければテストを止める。
func (e exportEnv) logged(t *testing.T, msg string) []map[string]any {
	t.Helper()
	var out []map[string]any
	dec := json.NewDecoder(bytes.NewReader(e.logs.Bytes()))
	for dec.More() {
		var line map[string]any
		if err := dec.Decode(&line); err != nil {
			t.Fatal(err)
		}
		if line["msg"] == msg {
			out = append(out, line)
		}
	}
	if len(out) == 0 {
		t.Fatalf("%q のログが無い:\n%s", msg, e.logs)
	}
	e.logs.Reset()
	return out
}

// wantCounts は、ログの行 line の数の項目が want と同じかを確認する。
func wantCounts(t *testing.T, line map[string]any, want map[string]float64) {
	t.Helper()
	for k, v := range want {
		if line[k] != v {
			t.Errorf("%s の %s = %v, want %v", line["msg"], k, line[k], v)
		}
	}
}

func TestExportLogsBatchAndBacklog(t *testing.T) {
	e := newExportEnv(t)
	d1 := e.create(t, "カンファレンス")
	e.run(t)
	e.logs.Reset()

	// 1 つは Google カレンダーで変わっていて確認が必要になり、1 つは書ける
	e.srv.Edit(googleCalID, eventID(t, d1.ID), func(ev *calendarv3.Event) { ev.Start.DateTime = "2026-11-04T15:00:00" })
	e.update(t, d1.ID, "buddy で変更", inmem.StaffID)
	e.create(t, "研修")
	e.run(t)
	batch := e.logged(t, "calendar export batch")[0]
	wantCounts(t, batch, map[string]float64{"claimed_count": 2, "succeeded_count": 1, "held_count": 1, "failed_count": 0, "requeued_count": 0})
	if batch["level"] != "INFO" {
		t.Errorf("要約の水準 = %v", batch["level"])
	}
	if ms, ok := batch["duration_ms"].(float64); !ok || ms < 0 {
		t.Errorf("duration_ms = %v", batch["duration_ms"])
	}

	// 一時的なエラーは失敗に数え、書き直す待ちは滞留に残る
	e.srv.Failures = []int{http.StatusServiceUnavailable}
	e.create(t, "面談")
	e.run(t)
	wantCounts(t, e.logged(t, "calendar export batch")[0], map[string]float64{"claimed_count": 1, "failed_count": 1})
	for id, x := range e.store.Exports {
		if x.Status == calendar.ExportPending {
			x.CreatedAt = time.Now().Add(-90 * time.Second)
			e.store.Exports[id] = x
		}
	}
	// 取るものが無いバッチの要約は Debug で書き、滞留は書く
	e.run(t)
	if b := e.logged(t, "calendar export batch")[0]; b["level"] != "DEBUG" || b["claimed_count"] != float64(0) {
		t.Errorf("取るものが無い要約 = %v", b)
	}
	e.run(t)
	// 確認が必要な待ち（d1）は数えない
	backlog := e.logged(t, "calendar export backlog")[0]
	wantCounts(t, backlog, map[string]float64{"pending_count": 1})
	if age, _ := backlog["oldest_pending_age_seconds"].(float64); age < 90 || age > 120 {
		t.Errorf("oldest_pending_age_seconds = %v", backlog["oldest_pending_age_seconds"])
	}
}

func TestExportLogsRequeuedOnShutdown(t *testing.T) {
	e := newExportEnv(t)
	e.create(t, "カンファレンス")
	ctx, cancel := context.WithCancel(t.Context())
	cancel()
	_, _ = e.exporter.ExportDue(ctx)
	if bytes.Contains(e.logs.Bytes(), []byte("calendar export backlog")) {
		t.Error("止めた後に滞留を数えた")
	}
	wantCounts(t, e.logged(t, "calendar export batch")[0], map[string]float64{"claimed_count": 1, "requeued_count": 1, "succeeded_count": 0})
}

// 取った待ちの事業所が buddy を予定の正本にしていなければ、書かずに確認が必要な待ち（conflict、not_buddy_primary）にして保留にする。
// 保留にした待ちは、要約の held_count に数え、書いていない待ちの滞留（pending）には数えない（ADR-0029）。
func TestExportHoldsNotBuddyPrimary(t *testing.T) {
	e := newExportEnv(t)
	d := e.create(t, "カンファレンス")
	setSourceMode(e.store, organization.SourceGooglePrimary)
	e.logs.Reset()
	if n := e.run(t); n != 1 {
		t.Fatalf("取った待ち = %d", n)
	}
	if ev := e.srv.Event(googleCalID, eventID(t, d.ID)); ev != nil {
		t.Errorf("google_primary の事業所の予定を書いた: %+v", ev)
	}
	x := e.export(t, d.ID)
	if x.Status != calendar.ExportConflict || x.ErrorCode == nil || *x.ErrorCode != calendar.ErrorNotBuddyPrimary || x.IsAcceptable() {
		t.Errorf("保留にした待ち = %+v", x)
	}
	wantCounts(t, e.logged(t, "calendar export batch")[0], map[string]float64{"claimed_count": 1, "held_count": 1, "succeeded_count": 0, "failed_count": 0})
	// 保留にした待ちは、次のバッチで取らない
	if n := e.run(t); n != 0 {
		t.Errorf("保留にした待ちを取り直した: %d", n)
	}
	wantCounts(t, e.logged(t, "calendar export backlog")[0], map[string]float64{"pending_count": 0})
	if issues, err := e.uc.ListExportIssues(e.ctx, inmem.FacilityID); err != nil || len(issues) != 1 {
		t.Errorf("確認が必要な予定 = %+v, %v", issues, err)
	}
}
