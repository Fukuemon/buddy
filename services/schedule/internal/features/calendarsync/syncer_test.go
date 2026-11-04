package calendarsync_test

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"testing"
	"time"

	calendarv3 "google.golang.org/api/calendar/v3"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendar"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendarexport"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendarsync"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/patient"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/schedule"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/scheduleview"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/staff"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/visit"
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
	codeI2           = "CODEI2"
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

func gcancelled(id, parent, original string) *calendarv3.Event {
	return &calendarv3.Event{
		Id: id, Status: "cancelled", RecurringEventId: parent,
		OriginalStartTime: &calendarv3.EventDateTime{DateTime: original},
	}
}

// syncEnv は、予定の操作と、書き出しの処理と、Google カレンダーの変更を当てる同期の処理と、確認が必要な予定を解く操作と、
// フェイクの Calendar API を、同じ Store の上で動かす。
type syncEnv struct {
	store     *inmem.Store
	ctx       context.Context
	uc        syncOps
	srv       *gcaltest.Server
	schedules scheduleOps
	exporter  *calendarexport.Exporter
	syncer    *calendarsync.Syncer
	// sources は、同期の処理が読む手段を引いた事業所の、引いた順の一覧である。
	sources *[]string
}

// syncOps は、同期のテストが呼ぶ、確認が必要な書き出しの待ちの操作の Do である。
type syncOps struct {
	ListExportIssues func(ctx context.Context, facilityID string) ([]calendar.ExportIssue, error)
	RetryExport      func(ctx context.Context, id string) (calendar.Export, error)
	AcceptExport     func(ctx context.Context, id string) (calendar.Export, error)
}

// scheduleOps は、同期のテストが呼ぶ schedule の操作の Do である。
type scheduleOps struct {
	Create           func(ctx context.Context, facilityID string, in schedule.SlotInput) (schedule.Schedule, error)
	CreateRecurring  func(ctx context.Context, facilityID string, in schedule.SlotInput, rule schedule.RuleInput) (schedule.RecurringSchedule, error)
	ChangeOccurrence func(ctx context.Context, recurringScheduleID string, originalDate civil.Date, in schedule.SlotInput) (schedule.Schedule, error)
	Cancel           func(ctx context.Context, scheduleID, reason string) (schedule.Cancellation, error)
	Update           func(ctx context.Context, scheduleID string, in schedule.SlotInput) (schedule.Schedule, error)
}

// oneAccount は、inmem.FacilityID の事業所だけに、source で読むサービスアカウントがある calendar.Accounts を返す。
type oneAccount struct{ source calendar.EventSource }

func (a oneAccount) ServiceAccount(_ context.Context, facilityID string) (string, error) {
	if facilityID != inmem.FacilityID {
		return "", calendar.ErrNotConfigured
	}
	return "buddy@example.iam.gserviceaccount.com", nil
}

func (a oneAccount) Source(_ context.Context, facilityID string) (calendar.EventSource, error) {
	if facilityID != inmem.FacilityID {
		return nil, calendar.ErrNotConfigured
	}
	return a.source, nil
}

func (a oneAccount) Writer(_ context.Context, _ string) (calendar.EventWriter, error) {
	return nil, calendar.ErrNotConfigured
}

func newSyncEnv(t *testing.T) syncEnv {
	t.Helper()
	srv := &gcaltest.Server{Calendars: map[string][][]*calendarv3.Event{googleCalID: {}, otherGoogleCalID: {}}}
	s := inmem.Seeded()
	s.Codes[codeI2] = visit.ServiceCode{ID: codeI2, Code: "訪看I2"}
	for id, name := range map[string]string{"PA": "利用者A", "PB1": "利用者B", "PB2": "利用者 B"} {
		s.Patients[id] = patient.Detail{Patient: patient.Patient{ID: id, FacilityID: inmem.FacilityID, Name: name}}
	}
	s.Calendars[calID] = calendar.ExternalCalendar{ID: calID, FacilityID: inmem.FacilityID, StaffID: inmem.StaffID, Provider: calendar.ProviderGoogle, CalendarID: googleCalID}
	// 外部の予定の ID を予定の ID から決めるので、予定の ID は ULID にする。
	ids := ulid.Generator{}
	ctx := principal.With(context.Background(), principal.Principal{Staff: staff.Detail{
		Summary: staff.Summary{Staff: staff.Staff{ID: inmem.StaffID, FacilityID: inmem.FacilityID}},
		Policies: []staff.PolicyGrant{
			{PolicyCode: organization.StaffManage}, {PolicyCode: organization.ScheduleAllEdit},
		},
	}})
	source := gcal.NewReader(gcaltest.Start(t, srv))
	exports, calendars, refs, tx := inmem.Exports{Store: s}, inmem.Calendars{Store: s}, inmem.StaffRefs{Store: s}, &inmem.Tx{}
	facilities, schedules, recurring, types := inmem.Facilities{Store: s}, inmem.Schedules{Store: s}, inmem.RecurringSchedules{Store: s}, inmem.ScheduleTypes{Store: s}
	uc := syncOps{
		ListExportIssues: calendarexport.NewListExportIssues(exports, principal.RequireStaffManage).Do,
		RetryExport:      calendarexport.NewRetryExport(exports, principal.RequireStaffManage).Do,
		AcceptExport: calendarsync.NewAcceptExport(exports, schedules, calendars, oneAccount{source}, refs,
			types, nil, nil, nil, tx, ids, principal.RequireStaffManage).Do,
	}
	outbox := calendarexport.NewOutbox(exports, calendars, ids)
	sched := scheduleOps{
		Create:           schedule.NewCreate(facilities, schedules, types, refs, nil, nil, outbox, tx, ids).Do,
		CreateRecurring:  schedule.NewCreateRecurring(facilities, types, refs, nil, nil, recurring, outbox, tx, ids).Do,
		ChangeOccurrence: schedule.NewChangeOccurrence(recurring, refs, schedules, types, nil, nil, outbox, tx, ids).Do,
		Cancel:           schedule.NewCancel(schedules, refs, outbox, tx, ids).Do,
		Update:           schedule.NewUpdate(schedules, refs, types, nil, nil, outbox, tx).Do,
	}
	writer := gcal.NewWriter(gcaltest.Start(t, srv))
	exporter := calendarexport.NewExporter(calendarexport.ExporterDeps{
		Exports: exports, Calendars: calendars,
		Writers:   func(context.Context, string) (calendar.EventWriter, error) { return writer, nil },
		Schedules: schedules, Recurring: recurring,
	}, ids, slog.New(slog.NewTextHandler(io.Discard, nil)))
	sources := &[]string{}
	return syncEnv{
		store: s, ctx: ctx, uc: uc, srv: srv, schedules: sched, exporter: exporter,
		syncer: newSyncer(s, source, sources, refs), sources: sources,
	}
}

// newSyncer は、Store s の上で、source で読み、職員の休職、復職、退職を st で待たせて職員を st で読む同期の処理を作る。
// 読む手段を引いた事業所を sources に足す。
func newSyncer(s *inmem.Store, source calendar.EventSource, sources *[]string, st calendar.StaffRefs) *calendarsync.Syncer {
	return calendarsync.NewSyncer(calendarsync.SyncerDeps{
		Syncs: inmem.Syncs{Store: s}, Calendars: inmem.Calendars{Store: s}, Staff: st, Exports: inmem.Exports{Store: s},
		Sources: func(_ context.Context, facilityID string) (calendar.EventSource, error) {
			*sources = append(*sources, facilityID)
			return source, nil
		},
		Schedules: inmem.Schedules{Store: s}, Recurring: inmem.RecurringSchedules{Store: s}, Types: inmem.ScheduleTypes{Store: s},
	}, &inmem.Tx{}, ulid.Generator{}, time.Minute, slog.New(slog.NewTextHandler(io.Discard, nil)))
}

func (e syncEnv) create(t *testing.T, title string) schedule.Schedule {
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

func (e syncEnv) update(t *testing.T, id, title string, staffID string) {
	t.Helper()
	_, err := e.schedules.Update(e.ctx, id, schedule.SlotInput{
		TypeID: inmem.NormalTypeID, Date: civil.Date{Year: 2026, Month: 11, Day: 5},
		StartTime: civil.Time{Hour: 13}, EndTime: civil.Time{Hour: 14}, StaffID: staffID, Title: &title,
	})
	if err != nil {
		t.Fatal(err)
	}
}

// run は、書く時刻を過ぎた書き出しの待ちを書き、書いた待ちの数を返す。
func (e syncEnv) run(t *testing.T) int {
	t.Helper()
	n, err := e.exporter.ExportDue(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	return n
}

// export は、予定 id の最後の書き出しの待ちを返す。
func (e syncEnv) export(t *testing.T, id string) calendar.Export {
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
func (e syncEnv) due() {
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

func (e syncEnv) sync(t *testing.T) {
	t.Helper()
	if _, err := e.syncer.SyncDue(t.Context()); err != nil {
		t.Fatal(err)
	}
}

func (e syncEnv) schedule(t *testing.T, id string) scheduleview.Detail {
	t.Helper()
	d, err := inmem.Schedules{Store: e.store}.Get(t.Context(), id)
	if err != nil {
		t.Fatal(err)
	}
	return d
}

func (e syncEnv) link(t *testing.T, scheduleID string) calendar.EventLink {
	t.Helper()
	l, err := inmem.Calendars{Store: e.store}.LinkBySchedule(t.Context(), scheduleID)
	if err != nil {
		t.Fatal(err)
	}
	return l
}

// shift は、職員が Google カレンダーで、11-04 の 10 時からの予定を 1 時間遅らせたときと同じく、予定の開始と終了を変えて etag を変える。
func (e syncEnv) shift(t *testing.T, eventID string) {
	t.Helper()
	ok := e.srv.Edit(googleCalID, eventID, func(ev *calendarv3.Event) {
		ev.Start.DateTime, ev.End.DateTime = "2026-11-04T11:00:00", "2026-11-04T12:00:00"
	})
	if !ok {
		t.Fatalf("予定 %s が無い", eventID)
	}
}

// created は、buddy で作って書き出した予定「カンファレンス」と、最初の同期を終えた状態を作る。
func (e syncEnv) created(t *testing.T) schedule.Schedule {
	t.Helper()
	d := e.create(t, "カンファレンス")
	e.run(t)
	e.sync(t)
	return d
}

func TestSyncAppliesChangeMadeOnlyInGoogle(t *testing.T) {
	e := newSyncEnv(t)
	d := e.created(t)
	writes := e.srv.Writes()

	e.shift(t, eventID(t, d.ID))
	e.sync(t)
	got := e.schedule(t, d.ID)
	if got.StartTime != (civil.Time{Hour: 11}) || got.EndTime != (civil.Time{Hour: 12}) || *got.Title != "カンファレンス" {
		t.Fatalf("Google の変更を当てた予定 = %+v", got.Slot)
	}
	l := e.link(t, d.ID)
	if l.ETag != e.srv.Event(googleCalID, eventID(t, d.ID)).Etag || *l.SyncedVersion != got.Version {
		t.Errorf("予定の対応 = %+v, 予定の更新の番号 %d", l, got.Version)
	}
	// Google の変更を当てた予定は、Google に書き戻さない
	if n := e.run(t); n != 0 || e.srv.Writes() != writes {
		t.Errorf("Google の変更を書き戻した: 待ち %d、書き込み %d", n, e.srv.Writes()-writes)
	}
	if issues, _ := e.uc.ListExportIssues(e.ctx, inmem.FacilityID); len(issues) != 0 {
		t.Errorf("確認が必要な予定 = %+v", issues)
	}

	// 変わっていなければ、もう一度読んでも当てない
	e.sync(t)
	if again := e.schedule(t, d.ID); again.Version != got.Version {
		t.Errorf("同じ変更を 2 回当てた: 更新の番号 %d → %d", got.Version, again.Version)
	}
}

func TestSyncIgnoresEchoOfExport(t *testing.T) {
	e := newSyncEnv(t)
	d := e.created(t)
	e.update(t, d.ID, "buddy で変更", inmem.StaffID)
	e.run(t)
	before := e.schedule(t, d.ID)

	// buddy が書いた変更が増分に戻ってくる
	e.sync(t)
	if got := e.schedule(t, d.ID); got.Version != before.Version || *got.Title != "buddy で変更" {
		t.Errorf("buddy が書いた変更を当て直した: %+v", got)
	}
	if issues, _ := e.uc.ListExportIssues(e.ctx, inmem.FacilityID); len(issues) != 0 {
		t.Errorf("確認が必要な予定 = %+v", issues)
	}
}

func TestSyncHoldsChangeMadeOnBothSides(t *testing.T) {
	e := newSyncEnv(t)
	d := e.created(t)
	// buddy の変更を書き出す前に、Google でも変えた
	e.srv.Failures = []int{http.StatusServiceUnavailable}
	e.update(t, d.ID, "buddy で変更", inmem.StaffID)
	e.run(t)
	e.shift(t, eventID(t, d.ID))

	e.sync(t)
	x := e.export(t, d.ID)
	if x.Status != calendar.ExportConflict || *x.ErrorCode != calendar.ErrorPreconditionFailed || !x.IsAcceptable() {
		t.Fatalf("待ち = %+v", x)
	}
	if got := e.schedule(t, d.ID); *got.Title != "buddy で変更" || got.StartTime != (civil.Time{Hour: 13}) {
		t.Errorf("両方で変わった予定に Google の変更を当てた: %+v", got.Slot)
	}
	// 解くまでは、buddy の変更を Google に書かない
	e.due()
	if n := e.run(t); n != 0 {
		t.Errorf("確認が必要な予定を書いた: %d", n)
	}
	if ev := e.srv.Event(googleCalID, eventID(t, d.ID)); ev.Summary != "カンファレンス" {
		t.Errorf("Google の予定 = %+v", ev)
	}

	got, err := e.uc.AcceptExport(e.ctx, x.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.Status != calendar.ExportSucceeded {
		t.Errorf("解いた待ち = %+v", got)
	}
	after := e.schedule(t, d.ID)
	if *after.Title != "カンファレンス" || after.Date.Day != 4 || after.StartTime != (civil.Time{Hour: 11}) {
		t.Errorf("Google の内容にした予定 = %+v", after.Slot)
	}
	if l := e.link(t, d.ID); *l.SyncedVersion != after.Version || l.ETag != e.srv.Event(googleCalID, eventID(t, d.ID)).Etag {
		t.Errorf("予定の対応 = %+v", l)
	}
	var ce *apperr.ConflictError
	if _, err := e.uc.AcceptExport(e.ctx, x.ID); !errors.As(err, &ce) || ce.Code != calendar.CodeExportNotInReview {
		t.Errorf("解いた待ちをもう一度解くエラー = %v", err)
	}
}

func TestSyncHoldsBothSidesResolvedWithBuddy(t *testing.T) {
	e := newSyncEnv(t)
	d := e.created(t)
	e.srv.Failures = []int{http.StatusServiceUnavailable}
	e.update(t, d.ID, "buddy で変更", inmem.StaffID)
	e.run(t)
	e.shift(t, eventID(t, d.ID))
	e.sync(t)

	x := e.export(t, d.ID)
	if _, err := e.uc.RetryExport(e.ctx, x.ID); err != nil {
		t.Fatal(err)
	}
	e.run(t)
	if ev := e.srv.Event(googleCalID, eventID(t, d.ID)); ev.Summary != "buddy で変更" || ev.Start.DateTime != "2026-11-05T13:00:00" {
		t.Errorf("buddy の内容で書き直した予定 = %+v", ev)
	}
	// 書き直した変更が戻ってきても、buddy の予定は変えない
	before := e.schedule(t, d.ID)
	e.sync(t)
	if got := e.schedule(t, d.ID); got.Version != before.Version {
		t.Errorf("書き直した変更を当て直した: %+v", got)
	}
}

func TestSyncCancelsScheduleDeletedInGoogle(t *testing.T) {
	e := newSyncEnv(t)
	d := e.created(t)
	if !e.srv.Delete(googleCalID, eventID(t, d.ID)) {
		t.Fatal("予定が無い")
	}
	e.sync(t)
	got := e.schedule(t, d.ID)
	if got.Cancel == nil || got.Cancel.Reason != "Google カレンダーで消されました" {
		t.Fatalf("消された予定 = %+v", got)
	}
	// キャンセルを Google に書き戻さない
	if n := e.run(t); n != 0 {
		t.Errorf("キャンセルを書き戻した: %d", n)
	}
}

func TestSyncHoldsScheduleDeletedInGoogleAndChangedInBuddy(t *testing.T) {
	e := newSyncEnv(t)
	d := e.created(t)
	e.srv.Failures = []int{http.StatusServiceUnavailable}
	e.update(t, d.ID, "buddy で変更", inmem.StaffID)
	e.run(t)
	e.srv.Delete(googleCalID, eventID(t, d.ID))
	e.sync(t)

	x := e.export(t, d.ID)
	if x.Status != calendar.ExportConflict || *x.ErrorCode != calendar.ErrorNotFound {
		t.Fatalf("待ち = %+v", x)
	}
	if e.schedule(t, d.ID).Cancel != nil {
		t.Fatal("両方で変わった予定をキャンセルした")
	}
	if _, err := e.uc.AcceptExport(e.ctx, x.ID); err != nil {
		t.Fatal(err)
	}
	if e.schedule(t, d.ID).Cancel == nil {
		t.Error("Google の内容で解いても、予定をキャンセルしていない")
	}
}

func TestSyncReadsAllEventsWhenTokenExpired(t *testing.T) {
	e := newSyncEnv(t)
	d := e.created(t)
	e.shift(t, eventID(t, d.ID))
	e.srv.ExpireSyncTokens()

	e.sync(t)
	got := e.schedule(t, d.ID)
	if got.StartTime != (civil.Time{Hour: 11}) {
		t.Fatalf("全ての予定を読み直して当てた予定 = %+v", got.Slot)
	}
	r := e.store.SyncResults[calID]
	if r.Status != calendarsync.SyncSucceeded || r.SyncToken == "" {
		t.Errorf("同期の結果 = %+v", r)
	}
	queries := e.srv.Queries()
	if last := queries[len(queries)-1]; last.Get("syncToken") != "" || last.Get("showDeleted") != "true" {
		t.Errorf("読み直しのリクエスト = %v", last)
	}
	// 読み直しても、同じ変更を 2 回は当てない
	e.srv.ExpireSyncTokens()
	e.sync(t)
	if again := e.schedule(t, d.ID); again.Version != got.Version {
		t.Errorf("読み直して同じ変更を当てた: 更新の番号 %d → %d", got.Version, again.Version)
	}
}

func TestSyncHoldsUnappliableChangeAndResolvesWhenFixed(t *testing.T) {
	e := newSyncEnv(t)
	d := e.created(t)
	id := eventID(t, d.ID)
	// 職員が Google カレンダーで終日の予定にした
	e.srv.Edit(googleCalID, id, func(ev *calendarv3.Event) {
		ev.Start = &calendarv3.EventDateTime{Date: "2026-11-04"}
		ev.End = &calendarv3.EventDateTime{Date: "2026-11-05"}
	})
	e.sync(t)
	x := e.export(t, d.ID)
	if x.Status != calendar.ExportConflict || *x.ErrorCode != calendar.ErrorUnappliable || x.IsAcceptable() {
		t.Fatalf("待ち = %+v", x)
	}
	var ce *apperr.ConflictError
	if _, err := e.uc.AcceptExport(e.ctx, x.ID); !errors.As(err, &ce) || ce.Code != calendar.CodeExportNotAcceptable {
		t.Errorf("読み替えられない変更を Google の内容で解くエラー = %v", err)
	}

	// 職員が Google カレンダーで時刻のある予定に戻すと、当てて解く
	e.srv.Edit(googleCalID, id, func(ev *calendarv3.Event) {
		ev.Start = &calendarv3.EventDateTime{DateTime: "2026-11-04T14:00:00", TimeZone: "Asia/Tokyo"}
		ev.End = &calendarv3.EventDateTime{DateTime: "2026-11-04T15:00:00", TimeZone: "Asia/Tokyo"}
	})
	e.sync(t)
	if got := e.schedule(t, d.ID); got.StartTime != (civil.Time{Hour: 14}) {
		t.Errorf("直した変更を当てた予定 = %+v", got.Slot)
	}
	if x := e.export(t, d.ID); x.Status != calendar.ExportSucceeded {
		t.Errorf("直した後の待ち = %+v", x)
	}
}

func TestSyncWaitsWhileExportIsWriting(t *testing.T) {
	e := newSyncEnv(t)
	d := e.created(t)
	before := e.store.SyncResults[calID]
	e.shift(t, eventID(t, d.ID))
	// 書き出しの処理が、予定を取って書いている
	e.update(t, d.ID, "buddy で変更", inmem.StaffID)
	x := e.export(t, d.ID)
	until := time.Now().Add(time.Minute)
	x.LockedUntil = &until
	e.store.Exports[x.ID] = x

	e.sync(t)
	r := e.store.SyncResults[calID]
	if r.SyncToken != before.SyncToken || r.After != 5*time.Second {
		t.Errorf("書いている間の同期の結果 = %+v, 前は %+v", r, before)
	}
	if x := e.export(t, d.ID); x.Status != calendar.ExportPending {
		t.Errorf("書いている待ちを確認が必要な待ちにした: %+v", x)
	}
}

func TestSyncReportsUnreadableCalendar(t *testing.T) {
	e := newSyncEnv(t)
	e.created(t)
	e.srv.Status = http.StatusNotFound
	e.sync(t)
	r := e.store.SyncResults[calID]
	if r.Status != calendarsync.SyncFailed || r.ErrorCode == nil || *r.ErrorCode != calendarsync.SyncUnreadable || r.SyncToken == "" {
		t.Errorf("読めないカレンダーの同期の結果 = %+v", r)
	}
}

// recurring は、毎週月曜の繰り返しの予定を buddy で作って書き出し、最初の同期を終えた状態を作る。
func (e syncEnv) recurring(t *testing.T) schedule.RecurringSchedule {
	t.Helper()
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
	e.sync(t)
	return rs
}

func TestSyncAppliesOccurrenceChanges(t *testing.T) {
	e := newSyncEnv(t)
	rs := e.recurring(t)
	parent := eventID(t, rs.ID)
	// 職員が Google カレンダーで、11-09 の回を取り消し、11-16 の回を午後に動かした
	e.srv.Put(googleCalID, gcancelled(parent+"_20261109T000000Z", parent, "2026-11-09T09:00:00+09:00"))
	e.srv.Put(googleCalID, gexception(parent+"_20261116T000000Z", parent, "定例",
		"2026-11-16T14:00:00+09:00", "2026-11-16T15:00:00+09:00", "2026-11-16T09:00:00+09:00"))
	e.sync(t)

	got, _ := inmem.RecurringSchedules{Store: e.store}.Get(t.Context(), rs.ID)
	if len(got.ExclusionDates) != 2 {
		t.Fatalf("除外した日 = %v", got.ExclusionDates)
	}
	var moved *scheduleview.Detail
	for _, d := range e.store.Schedules {
		if d.RecurringScheduleID != nil && *d.RecurringScheduleID == rs.ID {
			moved = &d
		}
	}
	if moved == nil || moved.Date.Day != 16 || moved.StartTime != (civil.Time{Hour: 14}) || *moved.Title != "定例" || moved.OriginalDate.Day != 16 {
		t.Fatalf("回を置き換えた予定 = %+v", moved)
	}
	pl, _ := inmem.Calendars{Store: e.store}.LinkByRecurringSchedule(t.Context(), rs.ID)
	if *pl.SyncedVersion != got.Version {
		t.Errorf("繰り返しの予定の対応の更新の番号 = %d、予定は %d", *pl.SyncedVersion, got.Version)
	}
	if issues, _ := e.uc.ListExportIssues(e.ctx, inmem.FacilityID); len(issues) != 0 {
		t.Errorf("確認が必要な予定 = %+v", issues)
	}

	// 動かした回をもう一度動かすと、置き換えた予定を変える
	e.srv.Edit(googleCalID, parent+"_20261116T000000Z", func(ev *calendarv3.Event) {
		ev.Start.DateTime, ev.End.DateTime = "2026-11-16T16:00:00+09:00", "2026-11-16T17:00:00+09:00"
	})
	e.sync(t)
	if d := e.schedule(t, moved.ID); d.StartTime != (civil.Time{Hour: 16}) {
		t.Errorf("もう一度動かした回 = %+v", d.Slot)
	}
	// buddy で繰り返しの予定を書き出し直しても、動かした回を EXDATE にしない
	if err := (inmem.RecurringSchedules{Store: e.store}).AddExclusion(t.Context(), rs.ID, civil.Date{Year: 2026, Month: 11, Day: 23}); err != nil {
		t.Fatal(err)
	}
	if err := calendarexport.NewOutbox(inmem.Exports{Store: e.store}, inmem.Calendars{Store: e.store}, ulid.Generator{}).
		RecurringChanged(t.Context(), inmem.FacilityID, inmem.StaffID, rs.ID); err != nil {
		t.Fatal(err)
	}
	e.run(t)
	if ev := e.srv.Event(googleCalID, parent); len(ev.Recurrence) != 2 || ev.Recurrence[1] != "EXDATE;TZID=Asia/Tokyo:20261109T090000,20261123T090000" {
		t.Errorf("書き出し直した繰り返し = %v", ev.Recurrence)
	}
}

func TestSyncHoldsOccurrenceReplacedOnBothSides(t *testing.T) {
	e := newSyncEnv(t)
	rs := e.recurring(t)
	parent := eventID(t, rs.ID)
	// buddy で 11-16 の回を置き換え、書き出す前に Google でも同じ回を動かした
	e.srv.Failures = []int{http.StatusServiceUnavailable, http.StatusServiceUnavailable}
	moved := "定例（buddy）"
	if _, err := e.schedules.ChangeOccurrence(e.ctx, rs.ID, civil.Date{Year: 2026, Month: 11, Day: 16}, schedule.SlotInput{
		TypeID: inmem.NormalTypeID, Date: civil.Date{Year: 2026, Month: 11, Day: 16},
		StartTime: civil.Time{Hour: 11}, EndTime: civil.Time{Hour: 12}, StaffID: inmem.StaffID, Title: &moved,
	}); err != nil {
		t.Fatal(err)
	}
	e.run(t)
	e.srv.Put(googleCalID, gexception(parent+"_20261116T000000Z", parent, "定例",
		"2026-11-16T14:00:00+09:00", "2026-11-16T15:00:00+09:00", "2026-11-16T09:00:00+09:00"))
	e.sync(t)

	x := e.export(t, rs.ID)
	if x.Status != calendar.ExportConflict || *x.ErrorCode != calendar.ErrorPreconditionFailed || x.IsAcceptable() {
		t.Fatalf("繰り返しの予定の待ち = %+v", x)
	}
}

func TestSyncHoldsRecurringChangedInGoogle(t *testing.T) {
	e := newSyncEnv(t)
	rs := e.recurring(t)
	before, _ := inmem.RecurringSchedules{Store: e.store}.Get(t.Context(), rs.ID)
	parent := eventID(t, rs.ID)
	// 職員が Google カレンダーで、繰り返しの曜日を変えた
	e.srv.Edit(googleCalID, parent, func(ev *calendarv3.Event) {
		ev.Recurrence = []string{"RRULE:FREQ=WEEKLY;BYDAY=TU;UNTIL=20261231T145959Z"}
	})
	e.sync(t)
	x := e.export(t, rs.ID)
	if x.Status != calendar.ExportConflict || *x.ErrorCode != calendar.ErrorUnappliable {
		t.Fatalf("待ち = %+v", x)
	}
	got, _ := inmem.RecurringSchedules{Store: e.store}.Get(t.Context(), rs.ID)
	if got.Version != before.Version {
		t.Errorf("繰り返しの予定を変えた: %+v", got)
	}

	// 職員が Google カレンダーで元に戻すと、解く
	e.srv.Edit(googleCalID, parent, func(ev *calendarv3.Event) {
		ev.Recurrence = []string{"RRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=20261231T145959Z"}
	})
	e.sync(t)
	if x := e.export(t, rs.ID); x.Status != calendar.ExportSucceeded {
		t.Errorf("戻した後の待ち = %+v", x)
	}
}

func TestSyncIgnoresEventsNotLinked(t *testing.T) {
	e := newSyncEnv(t)
	e.created(t)
	e.srv.Put(googleCalID, gevent("new", "Google で作った予定", "2026-11-06T10:00:00+09:00", "2026-11-06T11:00:00+09:00"))
	n := len(e.store.Schedules)
	e.sync(t)
	if len(e.store.Schedules) != n {
		t.Error("対応の無い予定を buddy に作った")
	}
}

func TestSyncAcceptRejectsScheduleCancelledInBuddy(t *testing.T) {
	e := newSyncEnv(t)
	d := e.created(t)
	e.srv.Failures = []int{http.StatusServiceUnavailable}
	if _, err := e.schedules.Cancel(e.ctx, d.ID, "中止"); err != nil {
		t.Fatal(err)
	}
	e.run(t)
	e.shift(t, eventID(t, d.ID))
	e.sync(t)

	issues, err := e.uc.ListExportIssues(e.ctx, inmem.FacilityID)
	if err != nil || len(issues) != 1 || issues[0].IsAcceptable() {
		t.Fatalf("キャンセルした予定の確認が必要な書き出し = %+v, %v", issues, err)
	}
	var ce *apperr.ConflictError
	if _, err := e.uc.AcceptExport(e.ctx, issues[0].ID); !errors.As(err, &ce) || ce.Code != calendar.CodeExportNotAcceptable {
		t.Errorf("キャンセルした予定を Google の内容に合わせるエラー = %v", err)
	}
}

func TestSyncAcceptCancelsWhenGoogleReturnsNotFound(t *testing.T) {
	e := newSyncEnv(t)
	d := e.created(t)
	// 書き出しが 404 を受けて止めた待ちと同じ形にする。Google の予定は、共有のあるカレンダーから無くなっている
	code := calendar.ErrorNotFound
	x := e.export(t, d.ID)
	x.ID, x.Status, x.ErrorCode, x.Revision = "NOTFOUND", calendar.ExportConflict, &code, 1
	e.store.Exports[x.ID] = x
	e.srv.Calendars[googleCalID] = [][]*calendarv3.Event{{}}

	if _, err := e.uc.AcceptExport(e.ctx, x.ID); err != nil {
		t.Fatal(err)
	}
	if e.schedule(t, d.ID).Cancel == nil {
		t.Error("Google で見つからない予定をキャンセルしていない")
	}
}

func TestSyncAcceptMovesEventWhenStaffChanged(t *testing.T) {
	e := newSyncEnv(t)
	e.store.Calendars["CAL2"] = calendar.ExternalCalendar{ID: "CAL2", FacilityID: inmem.FacilityID, StaffID: inmem.CompanionID, Provider: calendar.ProviderGoogle, CalendarID: otherGoogleCalID}
	d := e.created(t)
	// buddy で職員を替えて書き出す前に、前の職員の Google カレンダーで予定を遅らせた
	e.srv.Failures = []int{http.StatusServiceUnavailable}
	e.update(t, d.ID, "カンファレンス", inmem.CompanionID)
	e.run(t)
	e.shift(t, eventID(t, d.ID))
	e.sync(t)
	x := e.export(t, d.ID)
	if x.Status != calendar.ExportConflict {
		t.Fatalf("職員を替えた予定の待ち = %+v", x)
	}

	if _, err := e.uc.AcceptExport(e.ctx, x.ID); err != nil {
		t.Fatal(err)
	}
	if got := e.schedule(t, d.ID); got.StaffID != inmem.CompanionID || got.StartTime != (civil.Time{Hour: 11}) {
		t.Fatalf("Google の内容に合わせた予定 = %+v", got.Slot)
	}
	e.run(t)
	if ev := e.srv.Event(otherGoogleCalID, eventID(t, d.ID)); ev == nil || ev.Start.DateTime != "2026-11-04T11:00:00" {
		t.Errorf("新しい職員のカレンダーの予定 = %+v", ev)
	}
	if ev := e.srv.Event(googleCalID, eventID(t, d.ID)); ev.Status != "cancelled" {
		t.Errorf("前の職員のカレンダーの予定の状態 = %s", ev.Status)
	}
}

func TestSyncKeepsUnexportedDescription(t *testing.T) {
	e := newSyncEnv(t)
	d := e.created(t)
	e.srv.Failures = []int{http.StatusServiceUnavailable}
	title, memo := "カンファレンス", "資料を持参"
	if _, err := e.schedules.Update(e.ctx, d.ID, schedule.SlotInput{
		TypeID: inmem.NormalTypeID, Date: d.Date, StartTime: d.StartTime, EndTime: d.EndTime,
		StaffID: inmem.StaffID, Title: &title, Description: &memo,
	}); err != nil {
		t.Fatal(err)
	}
	e.run(t)
	// Google で、タイトルと日時を変えずに予定を直した（etag だけが変わる）
	e.srv.Edit(googleCalID, eventID(t, d.ID), func(*calendarv3.Event) {})
	e.sync(t)
	if x := e.export(t, d.ID); x.Status != calendar.ExportPending {
		t.Fatalf("説明だけを変えた予定の待ち = %+v", x)
	}
	e.due()
	e.run(t)
	if ev := e.srv.Event(googleCalID, eventID(t, d.ID)); ev.Description != memo {
		t.Errorf("Google の予定の説明 = %q", ev.Description)
	}
}

func TestSyncReadsRecurringWithCancelledOccurrenceAgain(t *testing.T) {
	e := newSyncEnv(t)
	rs := e.recurring(t)
	parent := eventID(t, rs.ID)
	e.srv.Put(googleCalID, gcancelled(parent+"_20261109T000000Z", parent, "2026-11-09T09:00:00+09:00"))
	e.sync(t)
	// トークンが切れて、取り消した回と変わっていない親の予定を読み直す
	e.srv.ExpireSyncTokens()
	e.sync(t)
	if issues, _ := e.uc.ListExportIssues(e.ctx, inmem.FacilityID); len(issues) != 0 {
		t.Errorf("取り消した回の後に読み直した親の予定を、確認が必要な予定にした: %+v", issues)
	}
}

func TestSyncCancelledOccurrenceReplacedInBuddy(t *testing.T) {
	e := newSyncEnv(t)
	rs := e.recurring(t)
	parent := eventID(t, rs.ID)
	moved := "定例（buddy）"
	// buddy で 11-16 の回を置き換え、書き出す前に Google で同じ回を取り消した
	e.srv.Failures = []int{http.StatusServiceUnavailable, http.StatusServiceUnavailable}
	if _, err := e.schedules.ChangeOccurrence(e.ctx, rs.ID, civil.Date{Year: 2026, Month: 11, Day: 16}, schedule.SlotInput{
		TypeID: inmem.NormalTypeID, Date: civil.Date{Year: 2026, Month: 11, Day: 16},
		StartTime: civil.Time{Hour: 11}, EndTime: civil.Time{Hour: 12}, StaffID: inmem.StaffID, Title: &moved,
	}); err != nil {
		t.Fatal(err)
	}
	e.run(t)
	e.srv.Put(googleCalID, gcancelled(parent+"_20261116T000000Z", parent, "2026-11-16T09:00:00+09:00"))
	e.sync(t)
	if x := e.export(t, rs.ID); x.Status != calendar.ExportConflict || *x.ErrorCode != calendar.ErrorPreconditionFailed {
		t.Errorf("書き出していない置き換えの回を取り消した待ち = %+v", x)
	}
}

func TestSyncCancelledOccurrenceEchoOfExportedReplacement(t *testing.T) {
	e := newSyncEnv(t)
	rs := e.recurring(t)
	parent := eventID(t, rs.ID)
	moved := "定例（buddy）"
	if _, err := e.schedules.ChangeOccurrence(e.ctx, rs.ID, civil.Date{Year: 2026, Month: 11, Day: 16}, schedule.SlotInput{
		TypeID: inmem.NormalTypeID, Date: civil.Date{Year: 2026, Month: 11, Day: 16},
		StartTime: civil.Time{Hour: 11}, EndTime: civil.Time{Hour: 12}, StaffID: inmem.StaffID, Title: &moved,
	}); err != nil {
		t.Fatal(err)
	}
	e.run(t)
	// 書き出した EXDATE を、Google が取り消した回として返したとき
	e.srv.Put(googleCalID, gcancelled(parent+"_20261116T000000Z", parent, "2026-11-16T09:00:00+09:00"))
	e.sync(t)
	if issues, _ := e.uc.ListExportIssues(e.ctx, inmem.FacilityID); len(issues) != 0 {
		t.Errorf("書き出した置き換えの回の取り消しを、確認が必要な予定にした: %+v", issues)
	}
}

func TestSyncCancelledOccurrenceWhileParentUnexported(t *testing.T) {
	e := newSyncEnv(t)
	rs := e.recurring(t)
	parent := eventID(t, rs.ID)
	moved := "定例（buddy）"
	occ, err := e.schedules.ChangeOccurrence(e.ctx, rs.ID, civil.Date{Year: 2026, Month: 11, Day: 16}, schedule.SlotInput{
		TypeID: inmem.NormalTypeID, Date: civil.Date{Year: 2026, Month: 11, Day: 16},
		StartTime: civil.Time{Hour: 11}, EndTime: civil.Time{Hour: 12}, StaffID: inmem.StaffID, Title: &moved,
	})
	if err != nil {
		t.Fatal(err)
	}
	// 置き換えた単発の予定だけを書き出し、親の EXDATE はまだ書き出していないときに、Google で同じ回を取り消した
	for id, x := range e.store.Exports {
		if x.RecurringScheduleID == rs.ID {
			x.NextAttemptAt = time.Now().Add(time.Hour)
			e.store.Exports[id] = x
		}
	}
	e.run(t)
	if e.srv.Event(googleCalID, eventID(t, occ.ID)) == nil {
		t.Fatal("置き換えた単発の予定を書き出していない")
	}
	e.srv.Put(googleCalID, gcancelled(parent+"_20261116T000000Z", parent, "2026-11-16T09:00:00+09:00"))
	e.sync(t)
	if x := e.export(t, rs.ID); x.Status != calendar.ExportConflict || *x.ErrorCode != calendar.ErrorPreconditionFailed {
		t.Errorf("親の EXDATE を書き出す前に取り消した回の待ち = %+v", x)
	}
}

// 増分の取得は、リクエストを受けずに動くので、カレンダーの行の事業所のサービスアカウントで読む。
func TestSyncUsesCalendarFacilityAccount(t *testing.T) {
	e := newSyncEnv(t)
	c := e.store.Calendars[calID]
	c.FacilityID = inmem.OtherFacilityID
	e.store.Calendars[calID] = c
	e.sync(t)
	if got := *e.sources; len(got) == 0 || got[0] != inmem.OtherFacilityID {
		t.Errorf("引いた事業所 = %v, want カレンダーの行の事業所", got)
	}
}

// TestSyncOvernight は、buddy で作った終了が翌日の予定を書き出し、戻ってきた予定を buddy の変更と見誤らないことと、
// Google カレンダーで日をまたぐ予定に変えた予定と、日をまたがない予定に戻した予定に、印を付け直して当てることを確認する（ADR-0023）。
func TestSyncOvernight(t *testing.T) {
	e := newSyncEnv(t)
	title := "夜勤"
	d, err := e.schedules.Create(e.ctx, inmem.FacilityID, schedule.SlotInput{
		TypeID: inmem.NormalTypeID, Date: civil.Date{Year: 2026, Month: 11, Day: 4},
		StartTime: civil.Time{Hour: 22}, EndTime: civil.Time{Hour: 1}, EndsNextDay: true, StaffID: inmem.StaffID, Title: &title,
	})
	if err != nil {
		t.Fatal(err)
	}
	e.run(t)
	created := e.schedule(t, d.ID)
	id := eventID(t, d.ID)
	if ev := e.srv.Event(googleCalID, id); ev.Start.DateTime != "2026-11-04T22:00:00" || ev.End.DateTime != "2026-11-05T01:00:00" {
		t.Fatalf("書き出した日時 = %s〜%s", ev.Start.DateTime, ev.End.DateTime)
	}
	e.sync(t)
	if got := e.schedule(t, d.ID); got.Version != created.Version {
		t.Fatalf("書き出した予定を当て直した: 更新の番号 %d → %d", created.Version, got.Version)
	}

	edit := func(start, end string) {
		t.Helper()
		if !e.srv.Edit(googleCalID, id, func(ev *calendarv3.Event) { ev.Start.DateTime, ev.End.DateTime = start, end }) {
			t.Fatalf("予定 %s が無い", id)
		}
		e.sync(t)
	}
	edit("2026-11-04T23:00:00", "2026-11-05T02:00:00")
	got := e.schedule(t, d.ID)
	if got.StartTime != (civil.Time{Hour: 23}) || got.EndTime != (civil.Time{Hour: 2}) || !got.EndsNextDay {
		t.Errorf("翌日に終わるように変えた予定 = %+v", got.Slot)
	}
	edit("2026-11-04T18:00:00", "2026-11-04T20:00:00")
	got = e.schedule(t, d.ID)
	if got.StartTime != (civil.Time{Hour: 18}) || got.EndTime != (civil.Time{Hour: 20}) || got.EndsNextDay {
		t.Errorf("日をまたがないように戻した予定 = %+v", got.Slot)
	}
	edit("2026-11-04T22:00:00", "2026-11-06T01:00:00")
	if got := e.schedule(t, d.ID); got.EndTime != (civil.Time{Hour: 20}) {
		t.Errorf("2 日にわたる予定を当てた: %+v", got.Slot)
	}
	if issues, _ := e.uc.ListExportIssues(e.ctx, inmem.FacilityID); len(issues) != 1 || issues[0].ErrorCode == nil || *issues[0].ErrorCode != calendar.ErrorUnappliable {
		t.Errorf("2 日にわたる予定の確認が必要な予定 = %+v", issues)
	}
}
