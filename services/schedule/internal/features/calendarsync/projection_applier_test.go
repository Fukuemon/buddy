package calendarsync_test

import (
	"bytes"
	"context"
	"log/slog"
	"testing"
	"time"

	calendarv3 "google.golang.org/api/calendar/v3"

	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendar"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendarsync"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/scheduleview"
	"github.com/Fukuemon/buddy/services/schedule/internal/gcal"
	"github.com/Fukuemon/buddy/services/schedule/internal/gcal/gcaltest"
	"github.com/Fukuemon/buddy/services/schedule/internal/inmem"
)

// このファイルのテストは、組み立て（assemble）と同じく google_primary の事業所にだけ ProjectionApplier を渡した同期の処理で、
// Google カレンダーの予定を Projection に写すことと、buddy_primary の事業所のカレンダーを読まないことを確認する（ADR-0026）。
// 予定の日付は、保持する期間（前々月の初日から）に、テストを流す日によらず入るよう、先の年にする。

// projectionEnv は、Store の事業所 inmem.FacilityID を google_primary にし、同期の処理を newProjectionSyncer で作った syncEnv である。
type projectionEnv struct {
	syncEnv
	syncer *calendarsync.Syncer
}

// newProjectionSyncer は、e の Store の上で、組み立てと同じく google_primary の事業所にだけ ProjectionApplier を渡した同期の処理を作る。
// 職員の休職、復職、退職とモードの切り替えを locks で待たせ、ログを log に書く。
func newProjectionSyncer(t *testing.T, e syncEnv, locks calendarsync.FacilityLock, log *slog.Logger) *calendarsync.Syncer {
	t.Helper()
	return calendarsync.NewSyncer(syncerDeps(e.store, gcal.NewReader(gcaltest.Start(t, e.srv)), e.sources, locks), calendarsync.Appliers{
		organization.SourceGooglePrimary: calendarsync.NewProjectionApplier(inmem.Projections{Store: e.store}, log),
	}, &inmem.Tx{}, time.Minute, log)
}

func newProjectionEnv(t *testing.T) projectionEnv {
	t.Helper()
	e := newSyncEnv(t)
	setSourceMode(e.store, organization.SourceGooglePrimary)
	return projectionEnv{syncEnv: e, syncer: newProjectionSyncer(t, e, inmem.Facilities{Store: e.store}, discardLog)}
}

func (e projectionEnv) sync(t *testing.T) {
	t.Helper()
	if _, err := e.syncer.SyncDue(t.Context()); err != nil {
		t.Fatal(err)
	}
}

// row は、カレンダー calID の Google の予定 eventID の行を返す。無ければ false を返す。
func (e projectionEnv) row(eventID string) (scheduleview.Projection, bool) {
	p, ok := e.store.Projections[inmem.ProjectionKey{ExternalCalendarID: calID, EventID: eventID}]
	return p, ok
}

func (e projectionEnv) mustRow(t *testing.T, eventID string) scheduleview.Projection {
	t.Helper()
	p, ok := e.row(eventID)
	if !ok {
		t.Fatalf("予定 %s の行が無い: %+v", eventID, e.store.Projections)
	}
	return p
}

func instant(t *testing.T, s string) time.Time {
	t.Helper()
	v, err := time.Parse(time.RFC3339, s)
	if err != nil {
		t.Fatal(err)
	}
	return v
}

func sameInstant(p *time.Time, want time.Time) bool { return p != nil && p.Equal(want) }

func dateOf(y int, m time.Month, d int) *civil.Date { return &civil.Date{Year: y, Month: m, Day: d} }

func sameDate(p, want *civil.Date) bool {
	return (p == nil) == (want == nil) && (p == nil || *p == *want)
}

func weeklyEvent(id, summary, start, end string, rule string) *calendarv3.Event {
	ev := gevent(id, summary, start, end)
	ev.Start.TimeZone, ev.End.TimeZone = calendar.TimeZone, calendar.TimeZone
	ev.Recurrence = []string{rule}
	return ev
}

// TestSyncProjectsGooglePrimaryEvents は、google_primary の事業所で、Google カレンダーで作った予定、変えた予定、取り消した予定と、
// 繰り返しの予定の親と例外の回を、予定の対応の有無によらず Projection に写し、buddy の予定を作らないことを確認する。
// 同期を何度流しても、1 つの予定の行は 1 つである。
func TestSyncProjectsGooglePrimaryEvents(t *testing.T) {
	e := newProjectionEnv(t)
	schedules := len(e.store.Schedules)
	single := gevent("single", "担当者会議", "2099-11-04T13:00:00+09:00", "2099-11-04T14:00:00+09:00")
	single.Updated = "2099-10-30T08:00:00Z"
	e.srv.Put(googleCalID, single)
	e.srv.Put(googleCalID, weeklyEvent("weekly", "【訪看I2】利用者A", "2099-11-02T09:00:00+09:00", "2099-11-02T09:30:00+09:00",
		"RRULE:FREQ=WEEKLY;BYDAY=MO"))
	e.srv.Put(googleCalID, &calendarv3.Event{
		Id: "allday", Status: "confirmed", Summary: "研修",
		Start: &calendarv3.EventDateTime{Date: "2099-11-12"}, End: &calendarv3.EventDateTime{Date: "2099-11-13"},
	})
	e.sync(t)

	if n := len(e.store.Projections); n != 3 {
		t.Fatalf("行の数 = %d, want 3: %+v", n, e.store.Projections)
	}
	got := e.mustRow(t, "single")
	if got.Title != "担当者会議" || got.Status != scheduleview.ProjectionConfirmed || got.FacilityID != inmem.FacilityID ||
		got.StaffID != inmem.StaffID || got.RecurringEventID != "" ||
		!sameInstant(got.Start.At, instant(t, "2099-11-04T13:00:00+09:00")) || !sameInstant(got.End.At, instant(t, "2099-11-04T14:00:00+09:00")) ||
		!sameInstant(got.GoogleUpdatedAt, instant(t, "2099-10-30T08:00:00Z")) || !sameDate(got.LastEndDate, dateOf(2099, 11, 4)) ||
		got.ETag != e.srv.Event(googleCalID, "single").Etag || got.ProjectedAt.IsZero() {
		t.Errorf("単発の予定の行 = %+v", got)
	}
	if w := e.mustRow(t, "weekly"); w.Title != "【訪看I2】利用者A" || len(w.Recurrence) != 1 || w.TimeZone != calendar.TimeZone || w.LastEndDate != nil {
		t.Errorf("繰り返しの親の予定の行 = %+v, want 規則を持ち、終わる日が無い", w)
	}
	if a := e.mustRow(t, "allday"); a.Start.Date == nil || *a.Start.Date != *dateOf(2099, 11, 12) || a.Start.At != nil ||
		!sameDate(a.End.Date, dateOf(2099, 11, 13)) {
		t.Errorf("終日の予定の行 = %+v", a)
	}

	// 職員が Google カレンダーで、予定を変え、繰り返しの 11-09 の回を午後に動かし、11-16 の回を取り消した
	e.srv.Edit(googleCalID, "single", func(ev *calendarv3.Event) {
		ev.Summary = "担当者会議（変更）"
		ev.Start.DateTime, ev.End.DateTime = "2099-11-05T15:00:00+09:00", "2099-11-05T16:00:00+09:00"
	})
	e.srv.Put(googleCalID, gexception("weekly_20991109T000000Z", "weekly", "【訪看I2】利用者A",
		"2099-11-09T14:00:00+09:00", "2099-11-09T14:30:00+09:00", "2099-11-09T09:00:00+09:00"))
	e.srv.Put(googleCalID, gcancelled("weekly_20991116T000000Z", "weekly", "2099-11-16T09:00:00+09:00"))
	e.sync(t)

	if got := e.mustRow(t, "single"); got.Title != "担当者会議（変更）" || !sameInstant(got.Start.At, instant(t, "2099-11-05T15:00:00+09:00")) ||
		!sameDate(got.LastEndDate, dateOf(2099, 11, 5)) || got.ETag != e.srv.Event(googleCalID, "single").Etag {
		t.Errorf("変えた予定の行 = %+v", got)
	}
	moved := e.mustRow(t, "weekly_20991109T000000Z")
	if moved.RecurringEventID != "weekly" || moved.Status != scheduleview.ProjectionConfirmed ||
		!sameInstant(moved.OriginalStart.At, instant(t, "2099-11-09T09:00:00+09:00")) ||
		!sameInstant(moved.Start.At, instant(t, "2099-11-09T14:00:00+09:00")) {
		t.Errorf("動かした回の行 = %+v", moved)
	}
	cancelled := e.mustRow(t, "weekly_20991116T000000Z")
	if cancelled.RecurringEventID != "weekly" || cancelled.Status != scheduleview.ProjectionCancelled || cancelled.Title != "" ||
		cancelled.Start.At != nil || !sameInstant(cancelled.OriginalStart.At, instant(t, "2099-11-16T09:00:00+09:00")) ||
		!sameDate(cancelled.LastEndDate, dateOf(2099, 11, 16)) {
		t.Errorf("取り消した回の行 = %+v", cancelled)
	}

	// 変わっていなければ、もう一度読んでも行を増やさない
	e.sync(t)
	if n := len(e.store.Projections); n != 5 {
		t.Errorf("2 回目の同期の後の行の数 = %d, want 5", n)
	}

	// 職員が Google カレンダーで、単発の予定と繰り返しの予定を消した。行は消さず、取り消しの状態にする
	before := e.mustRow(t, "single")
	e.srv.Delete(googleCalID, "single")
	e.srv.Delete(googleCalID, "weekly")
	e.sync(t)
	today := civil.Today(time.Now())
	for _, id := range []string{"single", "weekly"} {
		got := e.mustRow(t, id)
		if got.Status != scheduleview.ProjectionCancelled || got.Title != "" || got.Start.At != nil || len(got.Recurrence) != 0 ||
			!sameDate(got.LastEndDate, &today) || got.ETag != e.srv.Event(googleCalID, id).Etag {
			t.Errorf("消した予定の行 %s = %+v, want 取り消しの状態で、終わる日は今日", id, got)
		}
	}
	// 取り消した親の例外の回は、取り消した回の行にし、元の開始と終わる日は残す
	if got := e.mustRow(t, "weekly_20991109T000000Z"); got.Status != scheduleview.ProjectionCancelled || got.Title != "" || got.Start.At != nil ||
		!sameInstant(got.OriginalStart.At, instant(t, "2099-11-09T09:00:00+09:00")) || !sameDate(got.LastEndDate, dateOf(2099, 11, 9)) {
		t.Errorf("取り消した親の動かした回の行 = %+v, want 取り消した回", got)
	}
	if got := e.mustRow(t, "single"); got.GoogleUpdatedAt == nil || !got.GoogleUpdatedAt.After(*before.GoogleUpdatedAt) {
		t.Errorf("消した予定の更新の時刻 = %v, want 消す前の %v より後", got.GoogleUpdatedAt, before.GoogleUpdatedAt)
	}
	if _, ok := e.row("allday"); !ok {
		t.Error("消していない予定の行を消した")
	}
	if len(e.store.Schedules) != schedules || len(e.store.Links) != 0 {
		t.Errorf("buddy の予定 %d 件、予定の対応 %d 件を作った", len(e.store.Schedules)-schedules, len(e.store.Links))
	}
	if r := e.store.SyncResults[calID]; r.Status != calendarsync.SyncSucceeded || !r.Synced {
		t.Errorf("同期の結果 = %+v", r)
	}
}

// TestSyncDoesNotReadBuddyPrimaryCalendars は、buddy_primary の事業所のカレンダーを、同期が取らず、Google を読まず、
// Projection にも buddy の予定にも書かないことを確認する。google_primary の事業所のカレンダーは、同じ回に読む。
func TestSyncDoesNotReadBuddyPrimaryCalendars(t *testing.T) {
	e := newSyncEnv(t)
	d := e.created(t)
	before := e.schedule(t, d.ID)
	e.shift(t, eventID(t, d.ID))
	e.srv.Put(googleCalID, gevent("added", "Google で足した予定", "2099-11-06T10:00:00+09:00", "2099-11-06T11:00:00+09:00"))
	queries := len(e.srv.Queries())
	results := e.store.SyncResults[calID]
	// 2 つ目の事業所は google_primary にし、職員にカレンダーを結び付ける
	f := e.store.Facilities[inmem.OtherFacilityID]
	f.SourceMode = organization.SourceGooglePrimary
	e.store.Facilities[inmem.OtherFacilityID] = f
	e.store.Calendars["CAL2"] = calendar.ExternalCalendar{
		ID: "CAL2", FacilityID: inmem.OtherFacilityID, StaffID: inmem.OtherStaffID, Provider: calendar.ProviderGoogle, CalendarID: otherGoogleCalID,
	}
	*e.sources = nil

	syncer := newProjectionSyncer(t, e, inmem.Facilities{Store: e.store}, discardLog)
	n, err := syncer.SyncDue(t.Context())
	if err != nil || n != 1 {
		t.Fatalf("SyncDue = %d, %v, want google_primary の 1 件だけを取る", n, err)
	}
	if got := *e.sources; len(got) != 1 || got[0] != inmem.OtherFacilityID {
		t.Errorf("読む手段を引いた事業所 = %v, want google_primary の事業所だけ", got)
	}
	if got := len(e.srv.Queries()) - queries; got != 1 {
		t.Errorf("Google を読んだ回数 = %d, want google_primary のカレンダーの 1 回", got)
	}
	if got := e.store.SyncResults[calID]; got != results {
		t.Errorf("buddy_primary のカレンダーの同期の結果 = %+v, want 前のまま %+v", got, results)
	}
	if got := e.schedule(t, d.ID); got.StartTime != before.StartTime || got.Version != before.Version {
		t.Errorf("buddy_primary の事業所の予定に Google の変更を当てた: %+v", got.Slot)
	}
	for k := range e.store.Projections {
		if k.ExternalCalendarID == calID {
			t.Errorf("buddy_primary のカレンダーの予定 %s を Projection に写した", k.EventID)
		}
	}
	if r := e.store.SyncResults["CAL2"]; r.Status != calendarsync.SyncSucceeded || !r.Synced {
		t.Errorf("google_primary のカレンダーの同期の結果 = %+v", r)
	}
}

// TestSyncProjectionRereadsAllOnExpiredToken は、トークンが切れた（410）とき、全ての予定を読み直し、読み直しに無かった行を消し、
// 読み直した予定の行を重ねないことを確認する。増分で取り消しを取りこぼした行が、これで消える。
func TestSyncProjectionRereadsAllOnExpiredToken(t *testing.T) {
	e := newProjectionEnv(t)
	e.srv.Put(googleCalID, gevent("a", "予定 A", "2099-11-04T10:00:00+09:00", "2099-11-04T11:00:00+09:00"))
	e.srv.Put(googleCalID, gevent("b", "予定 B", "2099-11-05T10:00:00+09:00", "2099-11-05T11:00:00+09:00"))
	e.sync(t)
	// 増分の取得で、Google で消した予定の取り消しを取りこぼした行
	e.store.Projections[inmem.ProjectionKey{ExternalCalendarID: calID, EventID: "missed"}] = scheduleview.Projection{
		ExternalCalendarID: calID, EventID: "missed", FacilityID: inmem.FacilityID, StaffID: inmem.StaffID,
		Status: scheduleview.ProjectionConfirmed, Title: "取りこぼした予定", LastEndDate: dateOf(2099, 11, 6),
	}
	// ほかのカレンダーの行は消さない
	other := inmem.ProjectionKey{ExternalCalendarID: "CAL9", EventID: "missed"}
	e.store.Projections[other] = scheduleview.Projection{ExternalCalendarID: "CAL9", EventID: "missed", LastEndDate: dateOf(2099, 11, 6)}
	e.srv.Edit(googleCalID, "a", func(ev *calendarv3.Event) { ev.Summary = "予定 A（変更）" })
	e.srv.ExpireSyncTokens()

	e.sync(t)
	if _, ok := e.row("missed"); ok {
		t.Error("読み直しに無かった行が残っている")
	}
	if _, ok := e.store.Projections[other]; !ok {
		t.Error("ほかのカレンダーの行を消した")
	}
	if got := e.mustRow(t, "a"); got.Title != "予定 A（変更）" {
		t.Errorf("読み直した予定の行 = %+v", got)
	}
	e.mustRow(t, "b")
	if n := len(e.store.Projections); n != 3 {
		t.Errorf("行の数 = %d, want 3", n)
	}
	queries := e.srv.Queries()
	if last := queries[len(queries)-1]; last.Get("syncToken") != "" || last.Get("showDeleted") != "true" {
		t.Errorf("読み直しのリクエスト = %v", last)
	}
	if r := e.store.SyncResults[calID]; r.Status != calendarsync.SyncSucceeded || r.SyncToken == "" || !r.Synced {
		t.Errorf("同期の結果 = %+v", r)
	}
}

// TestSyncStopsProjectingWhenModeChanged は、カレンダーを取った後に事業所の正本のモードが buddy_primary に変わったとき、
// 予定を Projection に写さず、同期の状態を前のまま書き、次から取らないことを確認する。
func TestSyncStopsProjectingWhenModeChanged(t *testing.T) {
	e := newProjectionEnv(t)
	e.sync(t)
	before := e.store.SyncResults[calID]
	e.srv.Put(googleCalID, gevent("added", "Google で足した予定", "2099-11-06T10:00:00+09:00", "2099-11-06T11:00:00+09:00"))

	syncer := newProjectionSyncer(t, e.syncEnv, lockHook{
		Facilities: inmem.Facilities{Store: e.store}, run: func() { setSourceMode(e.store, organization.SourceBuddyPrimary) },
	}, discardLog)
	if _, err := syncer.SyncDue(t.Context()); err != nil {
		t.Fatal(err)
	}
	if _, ok := e.row("added"); ok {
		t.Error("buddy_primary に変わった事業所の予定を Projection に写した")
	}
	if r := e.store.SyncResults[calID]; r.SyncToken != before.SyncToken || r.Status != before.Status || r.Synced {
		t.Errorf("同期の結果 = %+v, want 前のまま %+v", r, before)
	}
	if n, err := e.syncer.SyncDue(t.Context()); err != nil || n != 0 {
		t.Errorf("モードが変わった後の同期 = %d 件, %v, want 取らない", n, err)
	}
}

// TestSyncSkipsUnreadableEventAndProjectsOthers は、日時を読めない予定を写さずに前の行を消し、ほかの予定を写して同期を成功にすることと、
// ログに予定のタイトルと利用者名を書かず、事業所、カレンダー、Google の予定の ID を書くことを確認する。
func TestSyncSkipsUnreadableEventAndProjectsOthers(t *testing.T) {
	e := newProjectionEnv(t)
	bad := gevent("bad", "【訪看I2】利用者A", "2099-11-04T10:00:00+09:00", "2099-11-04T11:00:00+09:00")
	e.srv.Put(googleCalID, bad)
	e.sync(t)
	e.mustRow(t, "bad")

	e.srv.Edit(googleCalID, "bad", func(ev *calendarv3.Event) { ev.Start.DateTime = "日時ではない" })
	e.srv.Put(googleCalID, gevent("good", "【訪看I2】利用者B", "2099-11-05T10:00:00+09:00", "2099-11-05T11:00:00+09:00"))
	logs := &bytes.Buffer{}
	syncer := newProjectionSyncer(t, e.syncEnv, inmem.Facilities{Store: e.store},
		slog.New(slog.NewJSONHandler(logs, &slog.HandlerOptions{Level: slog.LevelDebug})))
	if _, err := syncer.SyncDue(t.Context()); err != nil {
		t.Fatal(err)
	}
	if _, ok := e.row("bad"); ok {
		t.Error("日時を読めない予定の前の行が残っている")
	}
	e.mustRow(t, "good")
	if r := e.store.SyncResults[calID]; r.Status != calendarsync.SyncSucceeded || !r.Synced {
		t.Errorf("同期の結果 = %+v, want 成功", r)
	}
	line := loggedLine(t, logs, "calendar projection skipped")
	if line["event_id"] != "bad" || line["external_calendar_id"] != calID || line["facility_id"] != inmem.FacilityID {
		t.Errorf("読めない予定のログ = %v", line)
	}
	for _, s := range []string{"利用者A", "利用者B", "訪看I2", googleCalID} {
		if bytes.Contains(logs.Bytes(), []byte(s)) {
			t.Errorf("ログに %q を書いた:\n%s", s, logs)
		}
	}
}

// TestSyncProjectionKeepsRetainedPeriod は、保持する期間（前々月の初日から）より前に終わった予定を写さず、前に終わった行を
// 増分の同期のたびに消すことと、終わりの無い繰り返しの予定と、最後の回を決められない繰り返しの予定を残すことを確認する。
func TestSyncProjectionKeepsRetainedPeriod(t *testing.T) {
	e := newProjectionEnv(t)
	for _, ev := range []*calendarv3.Event{
		gevent("old", "終わった予定", "2020-01-06T10:00:00+09:00", "2020-01-06T11:00:00+09:00"),
		weeklyEvent("oldweekly", "終わった繰り返し", "2020-01-06T09:00:00+09:00", "2020-01-06T09:30:00+09:00",
			"RRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=20200131T145959Z"),
		// 隔週は buddy の規則に写せないので、UNTIL で終わる日を決める
		weeklyEvent("oldbiweekly", "終わった隔週", "2020-01-06T09:00:00+09:00", "2020-01-06T09:30:00+09:00",
			"RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO;UNTIL=20200131T145959Z"),
		weeklyEvent("forever", "終わらない繰り返し", "2020-01-06T09:00:00+09:00", "2020-01-06T09:30:00+09:00", "RRULE:FREQ=WEEKLY;BYDAY=MO"),
		weeklyEvent("count", "回数の隔週", "2020-01-06T09:00:00+09:00", "2020-01-06T09:30:00+09:00", "RRULE:FREQ=WEEKLY;INTERVAL=2;COUNT=3"),
		gcancelled("forever_20200113T000000Z", "forever", "2020-01-13T09:00:00+09:00"),
		gevent("future", "先の予定", "2099-11-04T10:00:00+09:00", "2099-11-04T11:00:00+09:00"),
	} {
		e.srv.Put(googleCalID, ev)
	}
	e.sync(t)
	for _, id := range []string{"old", "oldweekly", "oldbiweekly", "forever_20200113T000000Z"} {
		if _, ok := e.row(id); ok {
			t.Errorf("保持する期間より前に終わった予定 %s を写した", id)
		}
	}
	for _, id := range []string{"forever", "count", "future"} {
		e.mustRow(t, id)
	}

	// 前の同期で写した後に、保持する期間より前になった行は、変わった予定が無い回も消す
	e.store.Projections[inmem.ProjectionKey{ExternalCalendarID: calID, EventID: "ended"}] = scheduleview.Projection{
		ExternalCalendarID: calID, EventID: "ended", Status: scheduleview.ProjectionConfirmed, LastEndDate: dateOf(2020, 2, 1),
	}
	e.sync(t)
	if _, ok := e.row("ended"); ok {
		t.Error("保持する期間より前に終わった行が残っている")
	}
	if n := len(e.store.Projections); n != 3 {
		t.Errorf("行の数 = %d, want 3", n)
	}
}

// 職員が退職してカレンダーが外れた後は、google_primary の事業所でも予定を Projection に写さない。
func TestSyncDoesNotProjectAfterRetirement(t *testing.T) {
	e := newProjectionEnv(t)
	e.srv.Put(googleCalID, gevent("added", "Google で足した予定", "2099-11-06T10:00:00+09:00", "2099-11-06T11:00:00+09:00"))
	syncer := newProjectionSyncer(t, e.syncEnv, lockHook{Facilities: inmem.Facilities{Store: e.store}, run: func() { retire(t, e.store) }}, discardLog)
	if _, err := syncer.SyncDue(context.WithoutCancel(t.Context())); err != nil {
		t.Fatal(err)
	}
	if len(e.store.Projections) != 0 {
		t.Errorf("退職した職員の予定を写した: %+v", e.store.Projections)
	}
}

// TestSyncProjectionKeepsRetainedOccurrences は、保持する期間の中に回が残る予定の行を、期間で消さないことを確認する。
// RRULE の UNTIL が古くても RDATE の回が期間の中にある親と、期間の中の回を期間より前に動かした例外の回が当たる。
func TestSyncProjectionKeepsRetainedOccurrences(t *testing.T) {
	e := newProjectionEnv(t)
	rdate := weeklyEvent("rdate", "足した回のある隔週", "2020-01-06T09:00:00+09:00", "2020-01-06T09:30:00+09:00",
		"RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO;UNTIL=20200131T145959Z")
	rdate.Recurrence = append(rdate.Recurrence, "RDATE;TZID=Asia/Tokyo:20991102T090000")
	for _, ev := range []*calendarv3.Event{
		rdate,
		weeklyEvent("forever", "終わらない繰り返し", "2099-11-02T09:00:00+09:00", "2099-11-02T09:30:00+09:00", "RRULE:FREQ=WEEKLY;BYDAY=MO"),
		// 期間の中の 2099-11-09 の回を、期間より前の日に動かした
		gexception("forever_20991109T000000Z", "forever", "動かした回",
			"2020-01-07T09:00:00+09:00", "2020-01-07T09:30:00+09:00", "2099-11-09T09:00:00+09:00"),
	} {
		e.srv.Put(googleCalID, ev)
	}
	e.sync(t)
	for _, id := range []string{"rdate", "forever", "forever_20991109T000000Z"} {
		e.mustRow(t, id)
	}
	// 写した後の同期でも、期間で消さない
	e.sync(t)
	for _, id := range []string{"rdate", "forever_20991109T000000Z"} {
		e.mustRow(t, id)
	}
}
