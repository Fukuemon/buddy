package calendar_test

import (
	"context"
	"fmt"
	"testing"
	"time"

	calendarv3 "google.golang.org/api/calendar/v3"

	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendar"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/patient"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/schedule"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/staff"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/visit"
	"github.com/Fukuemon/buddy/services/schedule/internal/gcal"
	"github.com/Fukuemon/buddy/services/schedule/internal/gcal/gcaltest"
	"github.com/Fukuemon/buddy/services/schedule/internal/inmem"
	"github.com/Fukuemon/buddy/services/schedule/internal/principal"
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
	uc    *calendar.App
	ctx   context.Context
	rng   calendar.Range
}

func newEnv(t *testing.T, srv *gcaltest.Server) env {
	t.Helper()
	s := inmem.Seeded()
	s.Codes[codeI2] = visit.ServiceCode{ID: codeI2, Code: "訪看I2"}
	for id, name := range map[string]string{"PA": "利用者A", "PB1": "利用者B", "PB2": "利用者 B"} {
		s.Patients[id] = patient.Detail{Patient: patient.Patient{ID: id, FacilityID: inmem.FacilityID, Name: name}}
	}
	s.Calendars[calID] = calendar.ExternalCalendar{ID: calID, FacilityID: inmem.FacilityID, StaffID: inmem.StaffID, Provider: calendar.ProviderGoogle, CalendarID: googleCalID}
	rng, err := calendar.NewRange(civil.Date{Year: 2026, Month: 11, Day: 1}, civil.Date{Year: 2026, Month: 11, Day: 30})
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
func withSource(e env, source calendar.EventSource) *calendar.App {
	return withStaff(e, source, inmem.StaffRefs{Store: e.store})
}

// withStaff は、withSource と同じ App を、職員を st で読むようにして作る。
func withStaff(e env, source calendar.EventSource, st calendar.StaffRefs) *calendar.App {
	return newApp(e, oneAccount(source, nil), st)
}

// withAccounts は、e の Store の上で、事業所ごとのサービスアカウント acc で予定を読む App を作る。
func withAccounts(e env, acc calendar.Accounts) *calendar.App {
	return newApp(e, acc, inmem.StaffRefs{Store: e.store})
}

func newApp(e env, acc calendar.Accounts, st calendar.StaffRefs) *calendar.App {
	s := e.store
	ids := &inmem.SeqIDs{}
	return calendar.NewApp(calendar.Deps{
		Calendars: inmem.Calendars{Store: s}, Accounts: acc,
		Staff: st, Patients: inmem.Patients{Store: s}, ServiceCodes: inmem.VisitMasters{Store: s},
		Types: inmem.ScheduleTypes{Store: s}, Schedules: inmem.Schedules{Store: s}, Recurring: inmem.RecurringSchedules{Store: s}, RecurringSchedules: inmem.RecurringSchedules{Store: s},
		Visits: visit.NewWriter(visit.WriterDeps{
			Staff:    inmem.StaffRefs{Store: s},
			Patients: patient.VisitFinder(inmem.Patients{Store: s}),
			Infos:    inmem.VisitInfos{Store: s}, Masters: inmem.VisitMasters{Store: s},
		}, ids),
	}, &inmem.Tx{}, ids, principal.RequireStaffManage)
}

func manager() context.Context {
	return principal.With(context.Background(), principal.Principal{Staff: staff.Detail{
		Summary:  staff.Summary{Staff: staff.Staff{ID: inmem.StaffID, FacilityID: inmem.FacilityID}},
		Policies: []staff.PolicyGrant{{PolicyCode: "staff.manage"}},
	}})
}

// importDecided は、プレビューのバージョンを取り込み方に付けてから確定する。バージョンを持つ取り込み方は、そのバージョンのまま送る。
func (e env) importDecided(t *testing.T, rng calendar.Range, ds []calendar.Decision) (calendar.ImportResult, error) {
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

func decisions() []calendar.Decision {
	return []calendar.Decision{
		{ExternalEventID: "ambiguous", Action: calendar.ActionPatient, PatientID: "PB2"},
		{ExternalEventID: "missing", Action: calendar.ActionNormal},
	}
}

func reviewIDs(items []calendar.ReviewItem) []string {
	out := make([]string, len(items))
	for i, r := range items {
		out[i] = r.ExternalEventID
	}
	return out
}

func recurringOf(t *testing.T, e env, eventID string) schedule.RecurringDetail {
	t.Helper()
	for _, l := range e.store.Links {
		if l.ExternalEventID == eventID && l.RecurringScheduleID != nil {
			return e.store.Recurring[*l.RecurringScheduleID]
		}
	}
	t.Fatalf("%s の繰り返しの予定が無い", eventID)
	return schedule.RecurringDetail{}
}

func scheduleOf(t *testing.T, e env, eventID string) schedule.Detail {
	t.Helper()
	for _, l := range e.store.Links {
		if l.ExternalEventID == eventID && l.ScheduleID != nil {
			return e.store.Schedules[*l.ScheduleID]
		}
	}
	t.Fatalf("%s の予定が無い", eventID)
	return schedule.Detail{}
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
		_, err := calendar.NewRange(tt.start, tt.end)
		if (err == nil) != tt.ok {
			t.Errorf("NewRange(%s, %s) err = %v", tt.start, tt.end, err)
		}
	}
}

func ExampleRange() {
	r, _ := calendar.NewRange(civil.Date{Year: 2026, Month: 11, Day: 1}, civil.Date{Year: 2026, Month: 11, Day: 30})
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
