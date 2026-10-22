package postgres

import (
	"context"
	"errors"
	"testing"
	"time"

	calendarv3 "google.golang.org/api/calendar/v3"

	"github.com/Fukuemon/buddy/apps/schedule-api/internal/apperr"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/calendar"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/civil"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/gcal"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/gcal/gcaltest"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/organization"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/principal"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/staff"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/ulid"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/visit"
)

func TestCalendarRepository(t *testing.T) {
	ctx := txContext(t)
	r := NewCalendarRepository(testDB)
	const (
		calID   = "01M3TD000000000000000000C0"
		otherID = "01M3TD000000000000000000C1"
		runOld  = "01M3TD000000000000000000R0"
		runNew  = "01M3TD000000000000000000R1"
		linkID  = "01M3TD000000000000000000K0"
	)
	c := calendar.ExternalCalendar{ID: calID, FacilityID: seedFacility, StaffID: seedMori, Provider: calendar.ProviderGoogle, CalendarID: "mori@example.com"}
	if err := r.Create(ctx, c); err != nil {
		t.Fatal(err)
	}
	other := c
	other.ID, other.CalendarID = otherID, "other@example.com"
	if err := r.Create(ctx, other); !errors.Is(err, apperr.ErrConflict) {
		t.Errorf("職員の 2 つ目のカレンダー: err = %v, want ErrConflict", err)
	}
	other.StaffID, other.CalendarID = seedHayashi, c.CalendarID
	if err := r.Create(ctx, other); !errors.Is(err, apperr.ErrConflict) {
		t.Errorf("ほかの職員の同じカレンダー: err = %v, want ErrConflict", err)
	}
	found, err := r.FindByCalendarID(ctx, calendar.ProviderGoogle, "mori@example.com")
	if err != nil || found.ID != calID || found.StaffID != seedMori {
		t.Fatalf("FindByCalendarID = %+v, %v", found, err)
	}
	if _, err := r.GetForUpdate(ctx, calID); err != nil {
		t.Fatal(err)
	}

	nov1, nov30 := civil.Date{Year: 2026, Month: 11, Day: 1}, civil.Date{Year: 2026, Month: 11, Day: 30}
	for _, id := range []string{runOld, runNew} {
		if err := r.CreateRun(ctx, calendar.ImportRun{
			ID: id, FacilityID: seedFacility, ExternalCalendarID: calID, RequestedBy: seedAoki,
			RangeStart: nov1, RangeEnd: nov30, Status: calendar.RunRunning,
		}); err != nil {
			t.Fatal(err)
		}
	}
	if running, err := r.RunningSince(ctx, calID, time.Now().Add(-time.Minute)); err != nil || !running {
		t.Errorf("RunningSince = %v, %v, want true", running, err)
	}
	if running, err := r.RunningSince(ctx, calID, time.Now().Add(time.Minute)); err != nil || running {
		t.Errorf("始めた時刻より後の RunningSince = %v, %v, want false", running, err)
	}
	if _, err := r.FinishRun(ctx, calendar.ImportRun{ID: runOld, Status: calendar.RunFailed}); err != nil {
		t.Fatal(err)
	}
	// 同じトランザクションの now() は同じ時刻なので、ID の大きい方を新しい取り込みとする。
	finished, err := r.FinishRun(ctx, calendar.ImportRun{ID: runNew, Status: calendar.RunSucceeded, ImportedCount: 3, SkippedCount: 1})
	if err != nil {
		t.Fatal(err)
	}
	if finished.Status != calendar.RunSucceeded || finished.ImportedCount != 3 || finished.SkippedCount != 1 || finished.FinishedAt == nil || finished.RangeEnd != nov30 {
		t.Errorf("FinishRun = %+v", finished)
	}
	list, err := r.ListByFacility(ctx, seedFacility)
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 1 || list[0].LastImport == nil || list[0].LastImport.ID != runNew {
		t.Fatalf("ListByFacility = %+v", list)
	}

	link := calendar.Link{
		ID: linkID, FacilityID: seedFacility, ExternalCalendarID: calID, ExternalEventID: "ev1",
		ETag: `"1"`, RecurringScheduleID: ptr(seedRecurring),
	}
	if err := r.CreateLink(ctx, link); err != nil {
		t.Fatal(err)
	}
	link.ID = "01M3TD000000000000000000K1"
	if err := r.CreateLink(ctx, link); !errors.Is(err, apperr.ErrConflict) {
		t.Errorf("同じ外部の予定の 2 つ目の対応: err = %v, want ErrConflict", err)
	}
	links, err := r.ListLinks(ctx, calID)
	if err != nil || len(links) != 1 || links[0].ExternalEventID != "ev1" || *links[0].RecurringScheduleID != seedRecurring {
		t.Fatalf("ListLinks = %+v, %v", links, err)
	}

	if err := r.Disable(ctx, calID); err != nil {
		t.Fatal(err)
	}
	if list, err := r.ListByFacility(ctx, seedFacility); err != nil || len(list) != 0 {
		t.Errorf("外した後の ListByFacility = %+v, %v", list, err)
	}
	if got, err := r.Get(ctx, calID); err != nil || got.DisabledAt == nil {
		t.Errorf("外した後の Get = %+v, %v", got, err)
	}
	other = calendar.ExternalCalendar{ID: otherID, FacilityID: seedFacility, StaffID: seedMori, Provider: calendar.ProviderGoogle, CalendarID: "other@example.com"}
	if err := r.Create(ctx, other); err != nil {
		t.Fatalf("外した後の職員の 2 つ目のカレンダー: err = %v", err)
	}
	if err := r.Enable(ctx, calID); !errors.Is(err, apperr.ErrConflict) {
		t.Errorf("外していないカレンダーがある職員の結び付け直し: err = %v, want ErrConflict", err)
	}
	if err := r.Disable(ctx, otherID); err != nil {
		t.Fatal(err)
	}
	if err := r.Enable(ctx, calID); err != nil {
		t.Fatal(err)
	}
	if got, err := r.Get(ctx, calID); err != nil || got.DisabledAt != nil {
		t.Errorf("結び付け直した後の Get = %+v, %v", got, err)
	}
	if links, err := r.ListLinks(ctx, calID); err != nil || len(links) != 1 {
		t.Errorf("結び付け直した後の ListLinks = %+v, %v（外しても対応は残す）", links, err)
	}
}

// TestCalendarImportInOneTransaction は、取り込みの手順が、繰り返しの予定、除外の日、回の置き換え、回ごとにした予定、
// 訪問の情報、予定の対応を、テーブルの制約に合う形で書けることを確かめる。
func TestCalendarImportInOneTransaction(t *testing.T) {
	ctx := txContext(t)
	ctx = principal.With(ctx, principal.Principal{Staff: staff.Detail{
		Summary:  staff.Summary{Staff: staff.Staff{ID: seedAoki, FacilityID: seedFacility}},
		Policies: []staff.PolicyGrant{{PolicyCode: organization.StaffManage}},
	}})
	ev := func(id, summary, start, end string) *calendarv3.Event {
		return &calendarv3.Event{Id: id, Status: "confirmed", Summary: summary, Etag: `"` + id + `"`,
			Start: &calendarv3.EventDateTime{DateTime: start}, End: &calendarv3.EventDateTime{DateTime: end}}
	}
	weekly := ev("weekly", "【訪看I2】見本　一郎", "2026-11-02T09:00:00+09:00", "2026-11-02T09:30:00+09:00")
	weekly.Recurrence = []string{"RRULE:FREQ=WEEKLY;BYDAY=MO"}
	moved := ev("weekly_1116", "【訪看I2】見本一郎", "2026-11-16T15:00:00+09:00", "2026-11-16T15:30:00+09:00")
	moved.RecurringEventId, moved.OriginalStartTime = "weekly", &calendarv3.EventDateTime{DateTime: "2026-11-16T09:00:00+09:00"}
	biweekly := ev("biweekly", "定例", "2026-11-03T16:00:00+09:00", "2026-11-03T17:00:00+09:00")
	biweekly.Recurrence = []string{"RRULE:FREQ=WEEKLY;INTERVAL=2"}
	srv := &gcaltest.Server{
		Calendars: map[string][][]*calendarv3.Event{"mori@example.com": {{
			ev("single", "【訪看Ⅰ2】見本 二葉", "2026-11-04T10:00:00+09:00", "2026-11-04T10:30:00+09:00"),
			weekly,
			{Id: "weekly_1109", Status: "cancelled", RecurringEventId: "weekly", OriginalStartTime: &calendarv3.EventDateTime{DateTime: "2026-11-09T09:00:00+09:00"}},
			moved,
			biweekly,
		}}},
		Instances: map[string][]*calendarv3.Event{"biweekly": {
			ev("biweekly_1103", "定例", "2026-11-03T16:00:00+09:00", "2026-11-03T17:00:00+09:00"),
			ev("biweekly_1117", "定例", "2026-11-17T16:00:00+09:00", "2026-11-17T17:00:00+09:00"),
		}},
	}
	calendars := NewCalendarRepository(testDB)
	const calID = "01M3TD000000000000000000C2"
	if err := calendars.Create(ctx, calendar.ExternalCalendar{ID: calID, FacilityID: seedFacility, StaffID: seedMori, Provider: calendar.ProviderGoogle, CalendarID: "mori@example.com"}); err != nil {
		t.Fatal(err)
	}
	patients := NewPatientRepository(testDB)
	masters := NewVisitMasterRepository(testDB)
	staffRefs := NewStaffRefRepository(testDB)
	schedules := NewScheduleRepository(testDB)
	recurring := NewRecurringScheduleRepository(testDB)
	ids := ulid.Generator{}
	uc := calendar.NewUsecase(calendar.Deps{
		Calendars: calendars, Accounts: sameAccount{gcal.NewReader(gcaltest.Start(t, srv))},
		Staff: staffRefs, Patients: patients, ServiceCodes: masters, Types: NewScheduleTypeRepository(testDB),
		Schedules: schedules, Recurring: recurring, RecurringSchedules: recurring,
		Visits: visit.NewWriter(visit.WriterDeps{
			Staff: staffRefs,
			Patients: func(ctx context.Context, id string) (string, string, error) {
				p, err := patients.Get(ctx, id)
				return p.ID, p.FacilityID, err
			},
			Infos: NewVisitInfoRepository(testDB), Masters: masters,
		}, ids),
	}, NewTransactor(testDB), ids, principal.RequireStaffManage)
	rng, err := calendar.NewRange(civil.Date{Year: 2026, Month: 11, Day: 1}, civil.Date{Year: 2026, Month: 11, Day: 30})
	if err != nil {
		t.Fatal(err)
	}
	res, err := uc.Import(ctx, calID, rng, nil)
	if err != nil {
		t.Fatal(err)
	}
	if res.Run.Status != calendar.RunSucceeded || res.Run.ImportedCount != 5 {
		t.Fatalf("Run = %+v", res.Run)
	}
	links, err := calendars.ListLinks(ctx, calID)
	if err != nil || len(links) != 5 {
		t.Fatalf("ListLinks = %d 件, %v", len(links), err)
	}
	byEvent := map[string]calendar.Link{}
	for _, l := range links {
		byEvent[l.ExternalEventID] = l
	}
	rs, err := recurring.Get(ctx, *byEvent["weekly"].RecurringScheduleID)
	if err != nil {
		t.Fatal(err)
	}
	if rs.Visit == nil || rs.Visit.PatientID != seedPatient || rs.StaffID != seedMori || len(rs.ExclusionDates) != 2 {
		t.Errorf("繰り返しの予定 = %+v", rs)
	}
	m, err := schedules.Get(ctx, *byEvent["weekly_1116"].ScheduleID)
	if err != nil {
		t.Fatal(err)
	}
	if m.RecurringScheduleID == nil || *m.RecurringScheduleID != rs.ID || m.OriginalDate == nil || m.OriginalDate.Day != 16 {
		t.Errorf("置き換えた予定 = %+v", m)
	}
	if l := byEvent["biweekly_1117"]; l.RecurringEventID == nil || *l.RecurringEventID != "biweekly" {
		t.Errorf("回ごとにした予定の対応 = %+v", l)
	}
	again, err := uc.Import(ctx, calID, rng, nil)
	if err != nil {
		t.Fatal(err)
	}
	if again.Run.ImportedCount != 0 || again.AlreadyImported != 5 {
		t.Errorf("2 回目 = %+v, AlreadyImported = %d", again.Run, again.AlreadyImported)
	}
}

// sameAccount は、全ての事業所で同じ source で読む calendar.Accounts である。書く手段は持たない。
type sameAccount struct{ source calendar.EventSource }

func (sameAccount) ServiceAccount(context.Context, string) (string, error) {
	return "buddy@example.iam.gserviceaccount.com", nil
}

func (a sameAccount) Source(context.Context, string) (calendar.EventSource, error) {
	return a.source, nil
}

func (sameAccount) Writer(context.Context, string) (calendar.EventWriter, error) {
	return nil, calendar.ErrNotConfigured
}
