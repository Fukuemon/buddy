package calendar_test

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"slices"
	"testing"
	"time"

	calendarv3 "google.golang.org/api/calendar/v3"

	"github.com/Fukuemon/buddy/apps/schedule-api/internal/apperr"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/calendar"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/civil"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/gcal"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/gcal/gcaltest"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/inmem"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/patient"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/principal"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/schedule"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/staff"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/visit"
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
	uc    *calendar.Usecase
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
	var source calendar.EventSource
	if srv != nil {
		source = gcal.NewReader(gcaltest.Start(t, srv))
	}
	ids := &inmem.SeqIDs{}
	uc := calendar.NewUsecase(calendar.Deps{
		Calendars: inmem.Calendars{Store: s}, Source: source, ServiceAccount: "buddy@example.iam.gserviceaccount.com",
		Staff: inmem.StaffRefs{Store: s}, Patients: inmem.Patients{Store: s}, ServiceCodes: inmem.VisitMasters{Store: s},
		Types: inmem.ScheduleTypes{Store: s}, Schedules: inmem.Schedules{Store: s}, Recurring: inmem.RecurringSchedules{Store: s}, RecurringSchedules: inmem.RecurringSchedules{Store: s},
		Visits: visit.NewWriter(visit.WriterDeps{
			Staff: inmem.StaffRefs{Store: s},
			Patients: func(_ context.Context, id string) (string, string, error) {
				p, ok := s.Patients[id]
				if !ok {
					return "", "", apperr.ErrNotFound
				}
				return p.ID, p.FacilityID, nil
			},
			Infos: inmem.VisitInfos{Store: s}, Masters: inmem.VisitMasters{Store: s},
		}, ids),
	}, &inmem.Tx{}, ids, principal.RequireStaffManage)
	rng, err := calendar.NewRange(civil.Date{Year: 2026, Month: 11, Day: 1}, civil.Date{Year: 2026, Month: 11, Day: 30})
	if err != nil {
		t.Fatal(err)
	}
	return env{store: s, uc: uc, ctx: manager(), rng: rng}
}

func manager() context.Context {
	return principal.With(context.Background(), principal.Principal{Staff: staff.Detail{
		Summary:  staff.Summary{Staff: staff.Staff{ID: inmem.StaffID, FacilityID: inmem.FacilityID}},
		Policies: []staff.PolicyGrant{{PolicyCode: "staff.manage"}},
	}})
}

func decisions() []calendar.Decision {
	return []calendar.Decision{
		{ExternalEventID: "ambiguous", Action: calendar.ActionPatient, PatientID: "PB2"},
		{ExternalEventID: "missing", Action: calendar.ActionNormal},
	}
}

func TestPreview(t *testing.T) {
	e := newEnv(t, fixture())
	p, err := e.uc.Preview(e.ctx, calID, e.rng)
	if err != nil {
		t.Fatal(err)
	}
	want := calendar.Counts{
		// visit、meeting、weekly、weekly の 11-16 の置き換え、biweekly の 2 回
		Import: 6, ImportVisit: 3, ImportNormal: 3, ExpandedOccurrences: 2,
		Recurring: 2, RecurringAsRule: 1, RecurringExpanded: 1,
		NeedsReview: 2, Skipped: 2,
	}
	if p.Counts != want {
		t.Errorf("Counts = %+v, want %+v", p.Counts, want)
	}
	if got := reviewIDs(p.NeedsReview); !slices.Equal(got, []string{"ambiguous", "missing"}) {
		t.Errorf("NeedsReview = %v", got)
	}
	amb := p.NeedsReview[0]
	if amb.Reason != calendar.ReviewPatientAmbiguous || len(amb.Candidates) != 2 || amb.Client != "利用者B" || amb.Service != "訪看I2" {
		t.Errorf("ambiguous = %+v", amb)
	}
	if p.NeedsReview[1].Reason != calendar.ReviewPatientNotFound || len(p.NeedsReview[1].Candidates) != 0 {
		t.Errorf("missing = %+v", p.NeedsReview[1])
	}
	var reasons []calendar.SkipReason
	for _, s := range p.Skipped {
		reasons = append(reasons, s.Reason)
	}
	if !slices.Equal(reasons, []calendar.SkipReason{calendar.SkipAllDay, calendar.SkipServiceNotFound}) {
		t.Errorf("Skipped = %v", reasons)
	}
	if len(e.store.Schedules)+len(e.store.Links) != 0 {
		t.Errorf("下見で予定か対応を書いた")
	}
}

func reviewIDs(items []calendar.ReviewItem) []string {
	out := make([]string, len(items))
	for i, r := range items {
		out[i] = r.ExternalEventID
	}
	return out
}

func TestImport(t *testing.T) {
	e := newEnv(t, fixture())
	res, err := e.uc.Import(e.ctx, calID, e.rng, decisions())
	if err != nil {
		t.Fatal(err)
	}
	if res.Run.Status != calendar.RunSucceeded || res.Run.ImportedCount != 8 || res.Run.SkippedCount != 2 || res.AlreadyImported != 0 {
		t.Errorf("Run = %+v, AlreadyImported = %d", res.Run, res.AlreadyImported)
	}
	if len(e.store.Schedules) != 7 || len(e.store.Recurring) != 2 || len(e.store.Links) != 8 {
		t.Fatalf("予定 %d、繰り返し %d、対応 %d", len(e.store.Schedules), len(e.store.Recurring), len(e.store.Links))
	}
	rs := recurringOf(t, e, "weekly")
	if rs.Rule.Frequency != schedule.Weekly || *rs.Rule.DayOfWeek != 1 || rs.Date != (civil.Date{Year: 2026, Month: 11, Day: 2}) {
		t.Errorf("繰り返し = %+v", rs)
	}
	nov := func(d int) civil.Date { return civil.Date{Year: 2026, Month: 11, Day: d} }
	if !slices.Equal(rs.ExclusionDates, []civil.Date{nov(9), nov(16)}) {
		t.Errorf("除外の日 = %v", rs.ExclusionDates)
	}
	moved := scheduleOf(t, e, "weekly_20261116")
	if moved.RecurringScheduleID == nil || *moved.RecurringScheduleID != rs.ID || *moved.OriginalDate != nov(16) || moved.StartTime.Hour != 15 {
		t.Errorf("置き換え = %+v", moved)
	}
	amb := scheduleOf(t, e, "ambiguous")
	if info := e.store.Infos[*amb.VisitInfoID]; info.PatientID != "PB2" || info.AssignedStaffID != inmem.StaffID || info.ServiceCodeID != codeI2 {
		t.Errorf("選んだ利用者の訪問の情報 = %+v", info)
	}
	if missing := scheduleOf(t, e, "missing"); missing.Title == nil || *missing.Title != "【訪看I2】利用者Z" || missing.VisitInfoID != nil {
		t.Errorf("通常の予定にした予定 = %+v", missing)
	}
	if inst := scheduleOf(t, e, "biweekly_20261117"); inst.RecurringScheduleID != nil || *inst.Title != "定例" {
		t.Errorf("回ごとにした予定 = %+v", inst)
	}

	// 同じ期間を 2 回確定しても、予定は重ならない。
	again, err := e.uc.Import(e.ctx, calID, e.rng, nil)
	if err != nil {
		t.Fatal(err)
	}
	if again.Run.ImportedCount != 0 || again.AlreadyImported != 8 {
		t.Errorf("2 回目 = %+v, AlreadyImported = %d", again.Run, again.AlreadyImported)
	}
	if len(e.store.Schedules) != 7 || len(e.store.Recurring) != 2 {
		t.Errorf("2 回目で予定が増えた: %d、%d", len(e.store.Schedules), len(e.store.Recurring))
	}
}

func TestImportAppliesLaterExceptionsToLinkedRecurring(t *testing.T) {
	srv := fixture()
	e := newEnv(t, srv)
	if _, err := e.uc.Import(e.ctx, calID, e.rng, decisions()); err != nil {
		t.Fatal(err)
	}
	// 12 月の期間には、前の取り込みの繰り返しの親と、12-07 の取り消しと 12-14 の変更が来る。
	srv.Calendars[googleCalID] = [][]*calendarv3.Event{{
		grecurring(gevent("weekly", "【訪看I2】利用者A", "2026-11-02T09:00:00+09:00", "2026-11-02T09:30:00+09:00"),
			"RRULE:FREQ=WEEKLY;BYDAY=MO"),
		gcancelled("weekly_20261207", "weekly", "2026-12-07T09:00:00+09:00"),
		gexception("weekly_20261214", "weekly", "【訪看I2】利用者A", "2026-12-14T11:00:00+09:00", "2026-12-14T11:30:00+09:00", "2026-12-14T09:00:00+09:00"),
	}}
	dec, err := calendar.NewRange(civil.Date{Year: 2026, Month: 12, Day: 1}, civil.Date{Year: 2026, Month: 12, Day: 31})
	if err != nil {
		t.Fatal(err)
	}
	res, err := e.uc.Import(e.ctx, calID, dec, nil)
	if err != nil {
		t.Fatal(err)
	}
	if res.Run.ImportedCount != 1 || res.AlreadyImported != 1 {
		t.Errorf("Run = %+v, AlreadyImported = %d", res.Run, res.AlreadyImported)
	}
	rs := recurringOf(t, e, "weekly")
	if !slices.Contains(rs.ExclusionDates, civil.Date{Year: 2026, Month: 12, Day: 7}) || !slices.Contains(rs.ExclusionDates, civil.Date{Year: 2026, Month: 12, Day: 14}) {
		t.Errorf("除外の日 = %v", rs.ExclusionDates)
	}
	if moved := scheduleOf(t, e, "weekly_20261214"); moved.RecurringScheduleID == nil || *moved.RecurringScheduleID != rs.ID {
		t.Errorf("置き換え = %+v", moved)
	}
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

func TestImportRejects(t *testing.T) {
	tests := []struct {
		name      string
		decisions []calendar.Decision
		running   bool
		want      error
	}{
		{name: "確かめが要る予定の取り込み方が足りない", decisions: decisions()[:1], want: apperr.ErrConflict},
		{name: "確かめが要る予定でない予定の取り込み方を送った",
			decisions: append(decisions(), calendar.Decision{ExternalEventID: "visit", Action: calendar.ActionSkip}), want: apperr.ErrConflict},
		{name: "選んだ利用者がいない",
			decisions: []calendar.Decision{{ExternalEventID: "ambiguous", Action: calendar.ActionPatient, PatientID: inmem.OtherPatientID}, decisions()[1]},
			want:      apperr.ErrInvalidInput},
		{name: "取り込みが進んでいる", decisions: decisions(), running: true, want: apperr.ErrConflict},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			e := newEnv(t, fixture())
			if tt.running {
				if err := (inmem.Calendars{Store: e.store}).CreateRun(e.ctx, calendar.ImportRun{ID: "RUN", ExternalCalendarID: calID, Status: calendar.RunRunning}); err != nil {
					t.Fatal(err)
				}
			}
			_, err := e.uc.Import(e.ctx, calID, e.rng, tt.decisions)
			if !errors.Is(err, tt.want) {
				t.Fatalf("err = %v, want %v", err, tt.want)
			}
			if len(e.store.Schedules)+len(e.store.Recurring)+len(e.store.Links) != 1 {
				// Seeded が入れた繰り返しの予定 1 件だけが残る。
				t.Errorf("何か書いた: 予定 %d、繰り返し %d、対応 %d", len(e.store.Schedules), len(e.store.Recurring), len(e.store.Links))
			}
			if tt.running {
				return
			}
			for _, r := range e.store.Runs {
				if r.Status != calendar.RunFailed {
					t.Errorf("取り込みの記録 = %+v, want failed", r)
				}
			}
		})
	}
}

func TestPreviewErrors(t *testing.T) {
	e := newEnv(t, &gcaltest.Server{Status: http.StatusNotFound})
	if _, err := e.uc.Preview(e.ctx, calID, e.rng); !errors.Is(err, calendar.ErrUnreadable) {
		t.Errorf("404: err = %v, want ErrUnreadable", err)
	}
	e = newEnv(t, &gcaltest.Server{Status: http.StatusInternalServerError})
	if _, err := e.uc.Preview(e.ctx, calID, e.rng); !errors.Is(err, calendar.ErrUnavailable) {
		t.Errorf("500: err = %v, want ErrUnavailable", err)
	}
	e = newEnv(t, nil)
	if _, err := e.uc.Preview(e.ctx, calID, e.rng); !errors.Is(err, calendar.ErrNotConfigured) {
		t.Errorf("設定なし: err = %v, want ErrNotConfigured", err)
	}
	if _, err := e.uc.ServiceAccount(e.ctx); !errors.Is(err, calendar.ErrNotConfigured) {
		t.Errorf("設定なし: ServiceAccount の err = %v", err)
	}
	e = newEnv(t, fixture())
	if err := e.uc.Unlink(e.ctx, calID); err != nil {
		t.Fatal(err)
	}
	if _, err := e.uc.Preview(e.ctx, calID, e.rng); !errors.Is(err, apperr.ErrNotFound) {
		t.Errorf("外したカレンダー: err = %v, want ErrNotFound", err)
	}
	if _, err := e.uc.Preview(context.Background(), calID, e.rng); !errors.Is(err, apperr.ErrForbidden) {
		t.Errorf("権限なし: err = %v, want ErrForbidden", err)
	}
}

func TestLink(t *testing.T) {
	srv := &gcaltest.Server{Calendars: map[string][][]*calendarv3.Event{googleCalID: {}, "other@example.com": {}}}
	e := newEnv(t, srv)
	delete(e.store.Calendars, calID)

	c, err := e.uc.Link(e.ctx, inmem.FacilityID, inmem.StaffID, " staff@example.com ")
	if err != nil {
		t.Fatal(err)
	}
	if c.StaffID != inmem.StaffID || c.CalendarID != googleCalID || c.Provider != calendar.ProviderGoogle {
		t.Errorf("結び付けたカレンダー = %+v", c)
	}
	for _, tt := range []struct {
		name, staffID, calendarID string
		want                      error
	}{
		{"すでに結び付いている", inmem.StaffID, googleCalID, apperr.ErrConflict},
		{"職員にほかのカレンダーがある", inmem.StaffID, "other@example.com", apperr.ErrConflict},
		{"ほかの職員に結び付いている", inmem.CompanionID, googleCalID, apperr.ErrConflict},
		{"別の事業所の職員", inmem.OtherStaffID, "other@example.com", apperr.ErrInvalidInput},
		{"読めないカレンダー", inmem.CompanionID, "nobody@example.com", calendar.ErrUnreadable},
	} {
		t.Run(tt.name, func(t *testing.T) {
			if _, err := e.uc.Link(e.ctx, inmem.FacilityID, tt.staffID, tt.calendarID); !errors.Is(err, tt.want) {
				t.Errorf("err = %v, want %v", err, tt.want)
			}
		})
	}

	if err := e.uc.Unlink(e.ctx, c.ID); err != nil {
		t.Fatal(err)
	}
	if list, err := e.uc.List(e.ctx, inmem.FacilityID); err != nil || len(list) != 0 {
		t.Errorf("外した後の一覧 = %v, %v", list, err)
	}
	again, err := e.uc.Link(e.ctx, inmem.FacilityID, inmem.StaffID, googleCalID)
	if err != nil {
		t.Fatal(err)
	}
	if again.ID != c.ID || again.DisabledAt != nil {
		t.Errorf("結び付け直したカレンダー = %+v, want 外した行 %s", again, c.ID)
	}
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
