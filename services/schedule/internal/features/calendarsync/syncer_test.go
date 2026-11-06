package calendarsync_test

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"slices"
	"testing"
	"time"

	calendarv3 "google.golang.org/api/calendar/v3"

	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendar"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendarexport"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendarsync"
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

func gcancelled(id, parent, original string) *calendarv3.Event {
	return &calendarv3.Event{
		Id: id, Status: "cancelled", RecurringEventId: parent,
		OriginalStartTime: &calendarv3.EventDateTime{DateTime: original},
	}
}

// syncEnv は、予定の作成と、書き出しの処理と、Google カレンダーの変更を写す同期の処理と、フェイクの Calendar API を、同じ Store の上で
// 動かす。同期の処理は、testAppliers の Applier で写す。
// 事業所 inmem.FacilityID は buddy_primary で、同期は読まない。同期を確認するテストは、setSourceMode で google_primary にする。
type syncEnv struct {
	store    *inmem.Store
	ctx      context.Context
	srv      *gcaltest.Server
	create   func(ctx context.Context, facilityID string, in schedule.SlotInput) (schedule.Schedule, error)
	exporter *calendarexport.Exporter
	syncer   *calendarsync.Syncer
	// sources は、同期の処理が読む手段を引いた事業所の、引いた順の一覧である。
	sources *[]string
}

func newSyncEnv(t *testing.T) syncEnv {
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
	source := gcal.NewReader(gcaltest.Start(t, srv))
	exports, calendars, refs, tx := inmem.Exports{Store: s}, inmem.Calendars{Store: s}, inmem.StaffRefs{Store: s}, &inmem.Tx{}
	facilities, schedules, recurring, types := inmem.Facilities{Store: s}, inmem.Schedules{Store: s}, inmem.RecurringSchedules{Store: s}, inmem.ScheduleTypes{Store: s}
	outbox := calendarexport.NewOutbox(inmem.Facilities{Store: s}, exports, calendars, ids)
	writer := gcal.NewWriter(gcaltest.Start(t, srv))
	exporter := calendarexport.NewExporter(calendarexport.ExporterDeps{
		Facilities: inmem.Facilities{Store: s},
		Exports:    exports, Calendars: calendars,
		Writers:   func(context.Context, string) (calendar.EventWriter, error) { return writer, nil },
		Schedules: schedules, Recurring: recurring,
	}, ids, slog.New(slog.NewTextHandler(io.Discard, nil)))
	sources := &[]string{}
	return syncEnv{
		store: s, ctx: ctx, srv: srv,
		create:   schedule.NewCreate(facilities, schedules, types, refs, facilities, nil, nil, outbox, tx, ids).Do,
		exporter: exporter,
		syncer:   newSyncer(s, source, sources, facilities), sources: sources,
	}
}

// discardLog は、テストの同期の処理が書くログを捨てる。
var discardLog = slog.New(slog.NewTextHandler(io.Discard, nil))

// testAppliers は、Store s の上で、組み立て（assemble）と同じく google_primary の事業所の変更を ProjectionApplier で Projection に写す
// Applier である。buddy_primary の事業所のカレンダーは読まない（ADR-0028）。
func testAppliers(s *inmem.Store) calendarsync.Appliers {
	return calendarsync.Appliers{
		organization.SourceGooglePrimary: calendarsync.NewProjectionApplier(inmem.Projections{Store: s}, inmem.CalendarEventRecords{Store: s}, inmem.VisitInfos{Store: s}, discardLog),
	}
}

// syncerDeps は、Store s の上で、source で読み、職員の休職、復職、退職とモードの切り替えを locks で待たせる同期の処理の依存である。
// 読む手段を引いた事業所を sources に足す。
func syncerDeps(s *inmem.Store, source calendar.EventSource, sources *[]string, locks calendarsync.FacilityLock) calendarsync.SyncerDeps {
	return calendarsync.SyncerDeps{
		Syncs: inmem.Syncs{Store: s}, Calendars: inmem.Calendars{Store: s}, Staff: inmem.StaffRefs{Store: s}, Locks: locks,
		Records: inmem.CalendarEventRecords{Store: s}, Visits: inmem.VisitInfos{Store: s},
		Sources: func(_ context.Context, facilityID string) (calendar.EventSource, error) {
			*sources = append(*sources, facilityID)
			return source, nil
		},
	}
}

// newSyncer は、syncerDeps の依存と testAppliers の Applier で同期の処理を作る。
func newSyncer(s *inmem.Store, source calendar.EventSource, sources *[]string, locks calendarsync.FacilityLock) *calendarsync.Syncer {
	return calendarsync.NewSyncer(syncerDeps(s, source, sources, locks), testAppliers(s), &inmem.Tx{}, time.Minute, discardLog)
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

// setSourceMode は、事業所 inmem.FacilityID の正本のモードを m にする。
func setSourceMode(s *inmem.Store, m organization.SourceMode) {
	setFacilitySourceMode(s, inmem.FacilityID, m)
}

// setFacilitySourceMode は、事業所 facilityID の正本のモードを m にする。
func setFacilitySourceMode(s *inmem.Store, facilityID string, m organization.SourceMode) {
	f := s.Facilities[facilityID]
	f.SourceMode = m
	s.Facilities[facilityID] = f
}

func (e syncEnv) schedule(t *testing.T, id string) scheduleview.Detail {
	t.Helper()
	d, err := inmem.Schedules{Store: e.store}.Get(t.Context(), id)
	if err != nil {
		t.Fatal(err)
	}
	return d
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

// created は、buddy_primary の事業所で、buddy で作った予定「カンファレンス」を書き出し、同期の処理を流した状態を作る。
func (e syncEnv) created(t *testing.T) schedule.Schedule {
	t.Helper()
	title := "カンファレンス"
	d, err := e.create(e.ctx, inmem.FacilityID, schedule.SlotInput{
		TypeID: inmem.NormalTypeID, Date: civil.Date{Year: 2026, Month: 11, Day: 4},
		StartTime: civil.Time{Hour: 10}, EndTime: civil.Time{Hour: 11}, StaffID: inmem.StaffID, Title: &title,
	})
	if err != nil {
		t.Fatal(err)
	}
	e.run(t)
	e.sync(t)
	return d
}

func TestSyncReportsUnreadableCalendar(t *testing.T) {
	e := newSyncEnv(t)
	setSourceMode(e.store, organization.SourceGooglePrimary)
	e.sync(t)
	e.srv.Status = http.StatusNotFound
	e.sync(t)
	r := e.store.SyncResults[calID]
	if r.Status != calendarsync.SyncFailed || r.ErrorCode == nil || *r.ErrorCode != calendarsync.SyncUnreadable || r.SyncToken == "" {
		t.Errorf("読めないカレンダーの同期の結果 = %+v", r)
	}
}

// 増分の取得は、リクエストを受けずに動くので、カレンダーの行の事業所のサービスアカウントで読む。
func TestSyncUsesCalendarFacilityAccount(t *testing.T) {
	e := newSyncEnv(t)
	setFacilitySourceMode(e.store, inmem.OtherFacilityID, organization.SourceGooglePrimary)
	c := e.store.Calendars[calID]
	c.FacilityID = inmem.OtherFacilityID
	e.store.Calendars[calID] = c
	e.sync(t)
	if got := *e.sources; len(got) == 0 || got[0] != inmem.OtherFacilityID {
		t.Errorf("引いた事業所 = %v, want カレンダーの行の事業所", got)
	}
}

// expiringSource は、トークンを付けた読み出しに 410（calendar.ErrSyncTokenExpired）を返し、トークンの無い読み出しに
// fails の順にエラーを返す EventSource である。fails を返し終えた後は、予定の無い全件と、次のトークン fresh を返す。
// 受けたトークンを、受けた順に tokens に足す。
type expiringSource struct {
	calendar.EventSource
	fails  []error
	tokens []string
}

func (s *expiringSource) Changes(_ context.Context, _, syncToken string) (calendar.Changes, error) {
	s.tokens = append(s.tokens, syncToken)
	if syncToken != "" {
		return calendar.Changes{}, calendar.ErrSyncTokenExpired
	}
	if len(s.fails) > 0 {
		err := s.fails[0]
		s.fails = s.fails[1:]
		return calendar.Changes{}, err
	}
	return calendar.Changes{NextSyncToken: "fresh"}, nil
}

// TestSyncRereadsAllAfterRereadFailsOnExpiredToken は、トークンが切れた（410）後の全件の読み直しが失敗したとき、
// 切れたトークンを残さずに失敗（unavailable）を書き、次の同期でトークンを付けずに全件を読み直すことを確認する。
func TestSyncRereadsAllAfterRereadFailsOnExpiredToken(t *testing.T) {
	e := newSyncEnv(t)
	setSourceMode(e.store, organization.SourceGooglePrimary)
	e.store.SyncResults[calID] = calendarsync.SyncResult{SyncToken: "expired", Status: calendarsync.SyncSucceeded, Synced: true}
	src := &expiringSource{fails: []error{calendar.ErrUnavailable}}
	syncer := newSyncer(e.store, src, &[]string{}, inmem.Facilities{Store: e.store})

	if _, err := syncer.SyncDue(t.Context()); err != nil {
		t.Fatal(err)
	}
	r := e.store.SyncResults[calID]
	if r.Status != calendarsync.SyncFailed || r.ErrorCode == nil || *r.ErrorCode != calendarsync.SyncUnavailable || r.SyncToken != "" || r.Synced {
		t.Fatalf("読み直しに失敗した同期の結果 = %+v, want トークンを空にした unavailable", r)
	}
	if _, err := syncer.SyncDue(t.Context()); err != nil {
		t.Fatal(err)
	}
	if r := e.store.SyncResults[calID]; r.Status != calendarsync.SyncSucceeded || r.SyncToken != "fresh" || !r.Synced {
		t.Errorf("次の同期の結果 = %+v, want 全件を読み直して成功", r)
	}
	if want := []string{"expired", "", ""}; !slices.Equal(src.tokens, want) {
		t.Errorf("読んだときのトークン = %q, want %q", src.tokens, want)
	}
}

// TestSyncKeepsStateWhenCalendarDetachedMidSync は、予定を当てる前にカレンダーが外れたとき、同期の状態のトークンと結果を
// 前のまま書き、最後の成功の時刻を進めない（Synced が false）ことを確認する。外したカレンダーは次から取らない。
func TestSyncKeepsStateWhenCalendarDetachedMidSync(t *testing.T) {
	e := newSyncEnv(t)
	setSourceMode(e.store, organization.SourceGooglePrimary)
	e.sync(t)
	before := e.store.SyncResults[calID]
	if before.Status != calendarsync.SyncSucceeded || before.SyncToken == "" {
		t.Fatalf("最初の同期の結果 = %+v", before)
	}
	e.srv.Put(googleCalID, gevent("added", "Google で足した予定", "2026-11-06T10:00:00+09:00", "2026-11-06T11:00:00+09:00"))

	syncer := newSyncer(e.store, gcal.NewReader(gcaltest.Start(t, e.srv)), &[]string{},
		lockHook{Facilities: inmem.Facilities{Store: e.store}, run: func() { retire(t, e.store) }})
	if _, err := syncer.SyncDue(t.Context()); err != nil {
		t.Fatal(err)
	}
	r := e.store.SyncResults[calID]
	if r.SyncToken != before.SyncToken || r.Status != before.Status || r.ErrorCode != nil || r.Synced {
		t.Errorf("外れた後の同期の結果 = %+v, want 前のまま %+v で Synced が false", r, before)
	}
	if n, err := e.syncer.SyncDue(t.Context()); err != nil || n != 0 {
		t.Errorf("外した後の同期 = %d 件, %v, want 取らない", n, err)
	}
}

// TestSyncFailsWithoutAccount は、事業所に Google カレンダーを読む設定が無いとき、Google を読まずに失敗（unavailable）を書き、
// トークンを残すことを確認する。設定を足した後に、増分の取得から続けられる。
func TestSyncFailsWithoutAccount(t *testing.T) {
	for name, sources := range map[string]calendar.SourceFor{
		"設定が無いエラー": func(context.Context, string) (calendar.EventSource, error) { return nil, calendar.ErrNotConfigured },
		"読む手段が無い":  func(context.Context, string) (calendar.EventSource, error) { return nil, nil },
	} {
		t.Run(name, func(t *testing.T) {
			e := newSyncEnv(t)
			setSourceMode(e.store, organization.SourceGooglePrimary)
			e.store.SyncResults[calID] = calendarsync.SyncResult{SyncToken: "kept", Status: calendarsync.SyncSucceeded, Synced: true}
			s := e.store
			syncer := calendarsync.NewSyncer(calendarsync.SyncerDeps{
				Syncs: inmem.Syncs{Store: s}, Calendars: inmem.Calendars{Store: s}, Staff: inmem.StaffRefs{Store: s},
				Locks: inmem.Facilities{Store: s}, Sources: sources,
			}, testAppliers(s), &inmem.Tx{}, time.Minute, discardLog)
			if _, err := syncer.SyncDue(t.Context()); err != nil {
				t.Fatal(err)
			}
			r := s.SyncResults[calID]
			if r.Status != calendarsync.SyncFailed || r.ErrorCode == nil || *r.ErrorCode != calendarsync.SyncUnavailable || r.SyncToken != "kept" || r.Synced {
				t.Errorf("同期の結果 = %+v, want トークンを残した unavailable", r)
			}
			if q := e.srv.Queries(); len(q) != 0 {
				t.Errorf("Google を読んだ: %v", q)
			}
		})
	}
}
