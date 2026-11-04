package calendarimport_test

import (
	"context"
	"fmt"
	"testing"
	"time"

	calendarv3 "google.golang.org/api/calendar/v3"

	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendar"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendarimport"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/patient"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/scheduleview"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/servicecode"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/staff"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/visit"
	"github.com/Fukuemon/buddy/services/schedule/internal/gcal"
	"github.com/Fukuemon/buddy/services/schedule/internal/gcal/gcaltest"
	"github.com/Fukuemon/buddy/services/schedule/internal/inmem"
	"github.com/Fukuemon/buddy/services/schedule/internal/kernel"
	"github.com/Fukuemon/buddy/services/schedule/internal/principal"
	"github.com/Fukuemon/buddy/services/schedule/internal/tx"
)

const (
	calID       = "CAL"
	googleCalID = "staff@example.com"
	codeI2      = "CODEI2"
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

func grecurring(ev *calendarv3.Event, rrule ...string) *calendarv3.Event {
	ev.Recurrence = rrule
	return ev
}

// fixture は、取り込みのテストの予定である。期間は 2026-11-01 から 2026-11-30 とする。
func fixture() *gcaltest.Server {
	return &gcaltest.Server{
		Calendars: map[string][][]*calendarv3.Event{googleCalID: {{
			gevent("visit", "【訪看I2】利用者 A", "2026-11-02T10:00:00+09:00", "2026-11-02T10:30:00+09:00"),
			gevent("ambiguous", "【訪看I2】利用者B", "2026-11-03T10:00:00+09:00", "2026-11-03T10:30:00+09:00"),
			gevent("missing", "【訪看I2】利用者Z", "2026-11-04T10:00:00+09:00", "2026-11-04T10:30:00+09:00"),
			gevent("meeting", "会議", "2026-11-05T13:00:00+09:00", "2026-11-05T14:00:00+09:00"),
			gevent("before", "会議", "2026-10-31T23:00:00+09:00", "2026-10-31T23:30:00+09:00"),
			{Id: "allday", Status: "confirmed", Summary: "研修", Etag: `"allday"`,
				Start: &calendarv3.EventDateTime{Date: "2026-11-06"}, End: &calendarv3.EventDateTime{Date: "2026-11-07"}},
			gevent("nocode", "【謎のサービス】利用者 A", "2026-11-07T10:00:00+09:00", "2026-11-07T10:30:00+09:00"),
			// 毎週月曜の繰り返し。11-09 を取り消し、11-16 を 15:00 に変えた。
			grecurring(gevent("weekly", "【訪看I2】利用者A", "2026-11-02T09:00:00+09:00", "2026-11-02T09:30:00+09:00"),
				"RRULE:FREQ=WEEKLY;BYDAY=MO"),
			gcancelled("weekly_20261109", "weekly", "2026-11-09T09:00:00+09:00"),
			gexception("weekly_20261116", "weekly", "【訪看I2】利用者A", "2026-11-16T15:00:00+09:00", "2026-11-16T15:30:00+09:00", "2026-11-16T09:00:00+09:00"),
			// 隔週は写せないので回ごとにする。
			grecurring(gevent("biweekly", "定例", "2026-11-03T16:00:00+09:00", "2026-11-03T17:00:00+09:00"),
				"RRULE:FREQ=WEEKLY;INTERVAL=2"),
		}}},
		Instances: map[string][]*calendarv3.Event{
			"biweekly": {
				gexception("biweekly_20261103", "biweekly", "定例", "2026-11-03T16:00:00+09:00", "2026-11-03T17:00:00+09:00", "2026-11-03T16:00:00+09:00"),
				gexception("biweekly_20261117", "biweekly", "定例", "2026-11-17T16:00:00+09:00", "2026-11-17T17:00:00+09:00", "2026-11-17T16:00:00+09:00"),
			},
		},
	}
}

type env struct {
	store *inmem.Store
	uc    *app
	ctx   context.Context
	rng   calendarimport.Range
}

func newEnv(t *testing.T, srv *gcaltest.Server) env {
	t.Helper()
	s := inmem.Seeded()
	s.Codes[codeI2] = servicecode.ServiceCode{ID: codeI2, Code: "訪看I2"}
	for id, name := range map[string]string{"PA": "利用者A", "PB1": "利用者B", "PB2": "利用者 B"} {
		s.Patients[id] = patient.Detail{Patient: patient.Patient{ID: id, FacilityID: inmem.FacilityID, Name: name}}
	}
	s.Calendars[calID] = calendar.ExternalCalendar{ID: calID, FacilityID: inmem.FacilityID, StaffID: inmem.StaffID, Provider: calendar.ProviderGoogle, CalendarID: googleCalID}
	rng, err := calendarimport.NewRange(civil.Date{Year: 2026, Month: 11, Day: 1}, civil.Date{Year: 2026, Month: 11, Day: 30})
	if err != nil {
		t.Fatal(err)
	}
	e := env{store: s, ctx: manager(), rng: rng}
	var source calendar.EventSource
	if srv != nil {
		source = gcal.NewReader(gcaltest.Start(t, srv))
	}
	e.uc = withSource(e, source)
	return e
}

// withSource は、e の Store の上で、自分の事業所のサービスアカウントの source で予定を読む App を作る。
func withSource(e env, source calendar.EventSource) *app {
	return withLocks(e, source, inmem.Facilities{Store: e.store})
}

// withLocks は、withSource と同じ App を、事業所を locks でロックするようにして作る。
func withLocks(e env, source calendar.EventSource, locks calendarimport.FacilityLock) *app {
	return newApp(e, oneAccount(source, nil), locks)
}

// withAccounts は、e の Store の上で、事業所ごとのサービスアカウント acc で予定を読む App を作る。
func withAccounts(e env, acc calendar.Accounts) *app {
	return newApp(e, acc, inmem.Facilities{Store: e.store})
}

func newApp(e env, acc calendar.Accounts, locks calendarimport.FacilityLock) *app {
	s := e.store
	ids := &inmem.SeqIDs{}
	return build(deps{
		Calendars: inmem.Calendars{Store: s}, Accounts: acc,
		Staff: inmem.StaffRefs{Store: s}, Locks: locks, Patients: inmem.Patients{Store: s}, ServiceCodes: inmem.ServiceCodes{Store: s},
		Types: inmem.ScheduleTypes{Store: s}, Schedules: inmem.Schedules{Store: s}, Recurring: inmem.RecurringSchedules{Store: s}, RecurringSchedules: inmem.RecurringSchedules{Store: s},
		Modes: inmem.Facilities{Store: s}, Syncs: inmem.Projections{Store: s}, Cutovers: inmem.Cutovers{Store: s}, Projections: inmem.Projections{Store: s},
		Visits: visit.NewWriter(visit.WriterDeps{
			Staff:    inmem.StaffRefs{Store: s},
			Patients: inmem.Patients{Store: s},
			Infos:    inmem.VisitInfos{Store: s}, ServiceCodes: inmem.ServiceCodes{Store: s}, Categories: inmem.VisitCategories{Store: s},
		}, ids),
	}, &inmem.Tx{}, ids, principal.RequireStaffManage)
}

func manager() context.Context {
	return principal.With(context.Background(), principal.Principal{Staff: principal.Staff{
		ID: inmem.StaffID, FacilityID: inmem.FacilityID,
		Policies: []staff.PolicyGrant{{PolicyCode: "staff.manage"}},
	}})
}

// importDecided は、プレビューのバージョンを取り込み方に付けてから確定する。バージョンを持つ取り込み方は、そのバージョンのまま送る。
func (e env) importDecided(t *testing.T, rng calendarimport.Range, ds []calendarimport.Decision) (calendarimport.ImportResult, error) {
	t.Helper()
	if p, err := e.uc.Preview(e.ctx, calID, rng); err == nil {
		rev := map[string]string{}
		for _, r := range p.ReviewItems {
			rev[r.ExternalEventID] = r.Revision
		}
		for i := range ds {
			if ds[i].Revision == "" {
				ds[i].Revision = rev[ds[i].ExternalEventID]
			}
		}
	}
	return e.uc.Import(e.ctx, calID, rng, ds)
}

func decisions() []calendarimport.Decision {
	return []calendarimport.Decision{
		{ExternalEventID: "ambiguous", Action: calendarimport.ActionPatient, PatientID: "PB2"},
		{ExternalEventID: "missing", Action: calendarimport.ActionNormal},
	}
}

func reviewIDs(items []calendarimport.ReviewItem) []string {
	out := make([]string, len(items))
	for i, r := range items {
		out[i] = r.ExternalEventID
	}
	return out
}

func recurringOf(t *testing.T, e env, eventID string) scheduleview.RecurringDetail {
	t.Helper()
	for _, l := range e.store.Links {
		if l.ExternalEventID == eventID && l.RecurringScheduleID != nil {
			return e.store.Recurring[*l.RecurringScheduleID]
		}
	}
	t.Fatalf("%s の繰り返しの予定が無い", eventID)
	return scheduleview.RecurringDetail{}
}

func scheduleOf(t *testing.T, e env, eventID string) scheduleview.Detail {
	t.Helper()
	for _, l := range e.store.Links {
		if l.ExternalEventID == eventID && l.ScheduleID != nil {
			return e.store.Schedules[*l.ScheduleID]
		}
	}
	t.Fatalf("%s の予定が無い", eventID)
	return scheduleview.Detail{}
}

func TestNewRange(t *testing.T) {
	d := func(y, m, day int) civil.Date { return civil.Date{Year: y, Month: time.Month(m), Day: day} }
	for _, tt := range []struct {
		start, end civil.Date
		ok         bool
	}{
		{d(2026, 11, 1), d(2026, 11, 1), true},
		{d(2026, 11, 1), d(2027, 10, 31), true},
		{d(2026, 11, 1), d(2027, 11, 1), false},
		{d(2026, 11, 2), d(2026, 11, 1), false},
	} {
		_, err := calendarimport.NewRange(tt.start, tt.end)
		if (err == nil) != tt.ok {
			t.Errorf("NewRange(%s, %s) err = %v", tt.start, tt.end, err)
		}
	}
}

func ExampleRange() {
	r, _ := calendarimport.NewRange(civil.Date{Year: 2026, Month: 11, Day: 1}, civil.Date{Year: 2026, Month: 11, Day: 30})
	fmt.Println(r.TimeMin().Format("2006-01-02T15:04:05Z07:00"), r.TimeMax().Format("2006-01-02T15:04:05Z07:00"))
	// Output: 2026-11-01T00:00:00+09:00 2026-12-01T00:00:00+09:00
}

// startFiltered は、Google と同じく、例外の回と単発の予定を今の開始日時で期間に絞る EventSource である。親の予定は絞らない。
type startFiltered struct{ calendar.EventSource }

func (s startFiltered) Events(ctx context.Context, id string, timeMin, timeMax time.Time) ([]calendar.Event, error) {
	events, err := s.EventSource.Events(ctx, id, timeMin, timeMax)
	var out []calendar.Event
	for _, ev := range events {
		start, perr := time.Parse(time.RFC3339, ev.Start.DateTime)
		if len(ev.Recurrence) > 0 || perr != nil || (!start.Before(timeMin) && start.Before(timeMax)) {
			out = append(out, ev)
		}
	}
	return out, err
}

// deps は、テストが calendarimport と calendar の操作の型に渡す依存である。テストが使わない依存は nil のままにする。
type deps struct {
	Calendars interface {
		calendar.Repository
		calendarimport.Calendars
	}
	Accounts           calendar.Accounts
	Staff              calendar.StaffRefs
	Locks              calendarimport.FacilityLock
	Patients           calendar.Patients
	ServiceCodes       calendar.ServiceCodes
	Types              calendar.Types
	Schedules          calendar.ScheduleStore
	Recurring          calendarimport.Recurring
	RecurringSchedules kernel.Finder[scheduleview.RecurringDetail]
	Visits             calendar.VisitStore
	Modes              calendarimport.FacilityModes
	Syncs              scheduleview.CalendarSyncs
	Cutovers           calendarimport.CutoverRepository
	Projections        calendarimport.Projections
}

// app は、テストが呼ぶ操作の Do である。取り込みの前後でカレンダーを外すテストのために、calendar の ServiceAccount と Unlink も持つ。
type app struct {
	ServiceAccount  func(ctx context.Context, facilityID string) (string, error)
	Unlink          func(ctx context.Context, id string) error
	Preview         func(ctx context.Context, id string, rng calendarimport.Range) (calendarimport.ImportPreview, error)
	Import          func(ctx context.Context, id string, rng calendarimport.Range, decisions []calendarimport.Decision) (calendarimport.ImportResult, error)
	StartCutover    func(ctx context.Context, facilityID string) (calendarimport.Cutover, error)
	GetCutover      func(ctx context.Context, facilityID string) (calendarimport.CutoverState, error)
	CompleteCutover func(ctx context.Context, id string) (calendarimport.Cutover, error)
	CancelCutover   func(ctx context.Context, id string) (calendarimport.Cutover, error)
}

// build は、d の依存で app の操作の型を作る。
func build(d deps, tx tx.Transactor, ids kernel.IDGenerator, guard organization.Guard) *app {
	return &app{
		ServiceAccount: calendar.NewServiceAccount(d.Accounts, guard).Do,
		Unlink:         calendar.NewUnlink(d.Calendars, guard).Do,
		Preview:        calendarimport.NewPreview(d.Calendars, d.Accounts, d.Staff, d.Patients, d.RecurringSchedules, d.ServiceCodes, d.Cutovers, guard).Do,
		Import: calendarimport.NewImport(d.Calendars, d.Accounts, d.Staff, d.Locks, d.Patients, d.RecurringSchedules, d.ServiceCodes,
			d.Types, d.Recurring, d.Schedules, d.Visits, d.Cutovers, tx, ids, guard).Do,
		StartCutover: calendarimport.NewStartCutover(d.Modes, d.Syncs, d.Cutovers, tx, ids, cutoverNow, guard).Do,
		GetCutover:   calendarimport.NewGetCutover(d.Syncs, d.Cutovers, guard).Do,
		CompleteCutover: calendarimport.NewCompleteCutover(d.Calendars, d.Accounts, d.Staff, d.Patients, d.RecurringSchedules, d.ServiceCodes,
			d.Modes, d.Syncs, d.Cutovers, d.Projections, tx, guard).Do,
		CancelCutover: calendarimport.NewCancelCutover(d.Modes, d.Cutovers, tx, guard).Do,
	}
}

// cutoverNow は、切り替えを始める時刻である。取り込みの期間は、この月の初日の 2026-11-01 から先の全てになる。
func cutoverNow() time.Time { return time.Date(2026, 11, 5, 9, 0, 0, 0, calendar.Tokyo) }
