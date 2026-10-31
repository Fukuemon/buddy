package gcal_test

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"google.golang.org/api/calendar/v3"
	"google.golang.org/api/option"

	"github.com/Fukuemon/buddy/services/receipt/internal/check"
	"github.com/Fukuemon/buddy/services/receipt/internal/gcal"
	"github.com/Fukuemon/buddy/services/receipt/internal/gcal/gcaltest"
	"github.com/Fukuemon/buddy/services/receipt/internal/record"
)

func timed(id, summary, start, end string) *calendar.Event {
	return &calendar.Event{
		Id: id, Status: "confirmed", Summary: summary,
		Start: &calendar.EventDateTime{DateTime: start},
		End:   &calendar.EventDateTime{DateTime: end},
	}
}

func april(t *testing.T) gcal.Month {
	t.Helper()
	m, err := gcal.ParseMonth("2024-04")
	if err != nil {
		t.Fatal(err)
	}
	return m
}

const org = "org-sample"

func mustMonth(t *testing.T, r *gcal.Reader, m gcal.Month) check.ScheduleSource {
	t.Helper()
	src, ok := r.Month(org, m)
	if !ok {
		t.Fatalf("組織 %s のカレンダーがない", org)
	}
	return src
}

func TestMonthOtherOrg(t *testing.T) {
	r := gcal.NewReader(gcaltest.Same{}, []gcal.Calendar{{ID: "staff-a@example.com", OrgID: org}})
	if _, ok := r.Month("org-other", april(t)); ok {
		t.Error("別の組織のカレンダーを読む")
	}
}

func TestSchedulesQuery(t *testing.T) {
	srv := gcaltest.NewServer(map[string]gcaltest.Calendar{"staff-a@example.com": {Summary: "職員B"}})
	r := gcal.NewReader(gcaltest.Same{Svc: gcaltest.Start(t, srv)}, []gcal.Calendar{{ID: "staff-a@example.com", OrgID: org}})
	if _, _, err := mustMonth(t, r, april(t)).Schedules(t.Context()); err != nil {
		t.Fatal(err)
	}
	qs := srv.Queries()
	if len(qs) != 1 {
		t.Fatalf("リクエストの数 = %d", len(qs))
	}
	want := map[string]string{
		"timeMin":      "2024-04-01T00:00:00+09:00",
		"timeMax":      "2024-05-01T00:00:00+09:00",
		"singleEvents": "true",
		"orderBy":      "startTime",
		"timeZone":     "Asia/Tokyo",
		"showDeleted":  "false",
	}
	for k, v := range want {
		if got := qs[0].Get(k); got != v {
			t.Errorf("%s = %q, want %q", k, got, v)
		}
	}
}

func TestSchedulesMonthEnd(t *testing.T) {
	for _, tt := range []struct{ month, min, max string }{
		{"2024-02", "2024-02-01T00:00:00+09:00", "2024-03-01T00:00:00+09:00"},
		{"2024-12", "2024-12-01T00:00:00+09:00", "2025-01-01T00:00:00+09:00"},
	} {
		srv := gcaltest.NewServer(map[string]gcaltest.Calendar{"staff-a@example.com": {}})
		r := gcal.NewReader(gcaltest.Same{Svc: gcaltest.Start(t, srv)}, []gcal.Calendar{{ID: "staff-a@example.com", OrgID: org, StaffName: "職員B"}})
		m, err := gcal.ParseMonth(tt.month)
		if err != nil {
			t.Fatal(err)
		}
		if _, _, err := mustMonth(t, r, m).Schedules(t.Context()); err != nil {
			t.Fatal(err)
		}
		if q := srv.Queries()[0]; q.Get("timeMin") != tt.min || q.Get("timeMax") != tt.max {
			t.Errorf("%s: timeMin %s timeMax %s", tt.month, q.Get("timeMin"), q.Get("timeMax"))
		}
	}
}

func TestSchedulesEvents(t *testing.T) {
	srv := gcaltest.NewServer(map[string]gcaltest.Calendar{
		"staff-a@example.com": {
			Summary: "職員B",
			Pages: [][]*calendar.Event{
				{
					timed("e1", "【訪看I2】利用者A", "2024-04-01T09:00:00+09:00", "2024-04-01T09:30:00+09:00"),
					// UTC で返っても Asia/Tokyo の日付と時刻にする。
					timed("e2", "【訪看I3】 利用者C", "2024-04-01T01:00:00Z", "2024-04-01T02:00:00Z"),
					{Id: "allday", Status: "confirmed", Summary: "【訪看I2】利用者A",
						Start: &calendar.EventDateTime{Date: "2024-04-02"}, End: &calendar.EventDateTime{Date: "2024-04-03"}},
					{Id: "cancelled", Status: "cancelled", Summary: "【訪看I2】利用者A",
						Start: &calendar.EventDateTime{DateTime: "2024-04-02T09:00:00+09:00"}, End: &calendar.EventDateTime{DateTime: "2024-04-02T09:30:00+09:00"}},
					timed("meeting", "会議", "2024-04-02T12:00:00+09:00", "2024-04-02T13:00:00+09:00"),
				},
				{
					// 繰り返しの予定を展開した 1 回ずつ。
					{Id: "weekly_20240403T000000Z", RecurringEventId: "weekly", Status: "confirmed", Summary: "【訪看I2】利用者K",
						Start: &calendar.EventDateTime{DateTime: "2024-04-03T09:00:00+09:00"}, End: &calendar.EventDateTime{DateTime: "2024-04-03T09:30:00+09:00"}},
					{Id: "weekly_20240410T000000Z", RecurringEventId: "weekly", Status: "confirmed", Summary: "【訪看I2】利用者K",
						Start: &calendar.EventDateTime{DateTime: "2024-04-10T09:00:00+09:00"}, End: &calendar.EventDateTime{DateTime: "2024-04-10T09:30:00+09:00"}},
					timed("bad-order", "】訪看I2【利用者A", "2024-04-04T09:00:00+09:00", "2024-04-04T09:30:00+09:00"),
					timed("no-client", "【訪看I2】", "2024-04-04T10:00:00+09:00", "2024-04-04T10:30:00+09:00"),
					timed("overnight", "【訪看I2】利用者A", "2024-04-04T23:30:00+09:00", "2024-04-05T00:30:00+09:00"),
					// 前の月に始まり、対象の月に終わる予定は、対象の月の予定にしない。
					timed("prev-month", "【訪看I2】利用者A", "2024-03-31T23:30:00+09:00", "2024-04-01T00:30:00+09:00"),
				},
			},
		},
		"staff-b@example.com": {
			Summary: "表示名",
			Pages: [][]*calendar.Event{{
				timed("e3", "【医】利用者D", "2024-04-01T13:00:00+09:00", "2024-04-01T14:00:00+09:00"),
			}},
		},
	})
	r := gcal.NewReader(gcaltest.Same{Svc: gcaltest.Start(t, srv)}, []gcal.Calendar{
		{ID: "staff-a@example.com", OrgID: org},
		{ID: "staff-b@example.com", OrgID: org, StaffName: "職員E"},
		{ID: "staff-c@example.com", OrgID: "org-other"},
	})
	recs, warns, err := mustMonth(t, r, april(t)).Schedules(t.Context())
	if err != nil {
		t.Fatal(err)
	}

	type row struct {
		date, client, staff, service, start, end string
		duration                                 int
	}
	var got []row
	for _, rec := range recs {
		got = append(got, row{rec.Key.Date.String(), rec.Key.Client, rec.Key.Staff, rec.Service, rec.Start.String(), rec.End.String(), *rec.Duration})
	}
	// 訪看I２ と 訪看I３ は、normalize.Schedules が終了時間と提供時間から 1 分引く。
	want := []row{
		{"2024-04-01", "利用者A", "職員B", "訪看I２", "09:00", "09:29", 29},
		{"2024-04-01", "利用者C", "職員B", "訪看I３", "10:00", "10:59", 59},
		{"2024-04-03", "利用者K", "職員B", "訪看I２", "09:00", "09:29", 29},
		{"2024-04-10", "利用者K", "職員B", "訪看I２", "09:00", "09:29", 29},
		{"2024-04-01", "利用者D", "職員E", "医", "13:00", "14:00", 60},
	}
	if len(got) != len(want) {
		t.Fatalf("records = %+v", got)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("records[%d] = %+v, want %+v", i, got[i], want[i])
		}
	}

	wantWarns := []struct {
		eventID string
		reason  record.Reason
	}{
		{"bad-order", record.ReasonUnreadableTitle},
		{"no-client", record.ReasonUnreadableTitle},
		{"overnight", record.ReasonSpansDays},
	}
	if len(warns) != len(wantWarns) {
		t.Fatalf("warnings = %+v", warns)
	}
	for i, w := range warns {
		want := wantWarns[i]
		if w.EventID != want.eventID || w.Reason != want.reason || w.CalendarID != "staff-a@example.com" || w.Start == "" || w.Message == "" {
			t.Errorf("warnings[%d] = %+v", i, w)
		}
	}
	if len(srv.Queries()) != 3 {
		t.Errorf("リクエストの数 = %d。ページ送りで 2、もう 1 つのカレンダーで 1 になる", len(srv.Queries()))
	}
	if q := srv.Queries()[1]; q.Get("pageToken") != "1" {
		t.Errorf("2 つ目のリクエストの pageToken = %q", q.Get("pageToken"))
	}
}

func TestSchedulesSourceError(t *testing.T) {
	srv := gcaltest.NewServer(nil)
	r := gcal.NewReader(gcaltest.Same{Svc: gcaltest.Start(t, srv)}, []gcal.Calendar{{ID: "unknown@example.com", OrgID: org}})
	_, _, err := mustMonth(t, r, april(t)).Schedules(t.Context())
	var se *check.SourceError
	if !errors.As(err, &se) {
		t.Fatalf("err = %v", err)
	}
	var ie *record.InputError
	if errors.As(err, &ie) {
		t.Errorf("入力のエラーにしない: %v", err)
	}
}

func TestParseMonth(t *testing.T) {
	if m, err := gcal.ParseMonth("2024-04"); err != nil || m.String() != "2024-04" {
		t.Errorf("= %v, %v", m, err)
	}
	for _, bad := range []string{"", "2024-4", "2024/04", "2024-13", "2024-04-01", "202404"} {
		if _, err := gcal.ParseMonth(bad); err == nil {
			t.Errorf("%q でエラーにならない", bad)
		}
	}
}

func TestLoadCalendars(t *testing.T) {
	write := func(t *testing.T, body string) string {
		t.Helper()
		p := filepath.Join(t.TempDir(), "calendars.json")
		if err := os.WriteFile(p, []byte(body), 0o600); err != nil {
			t.Fatal(err)
		}
		return p
	}
	cals, err := gcal.LoadCalendars(write(t, `[{"calendar_id":"staff-a@example.com","org_id":"org-a","staff_name":"職員B"},{"calendar_id":"staff-b@example.com","org_id":"org-b"}]`))
	if err != nil || len(cals) != 2 || cals[0].StaffName != "職員B" || cals[0].OrgID != "org-a" || cals[1].StaffName != "" {
		t.Errorf("= %+v, %v", cals, err)
	}
	for _, bad := range []string{
		`[]`,
		`[{"calendar_id":"","org_id":"org-a"}]`,
		`[{"calendar_id":"a@example.com"}]`,
		`[{"calendar_id":"a@example.com","org_id":" "}]`,
		`[{"calendar_id":"a@example.com","org_id":"org-a"},{"calendar_id":"a@example.com","org_id":"org-a"}]`,
		`[{"calendar_id":"a@example.com","org_id":"org-a","name":"x"}]`,
		`{}`,
	} {
		if _, err := gcal.LoadCalendars(write(t, bad)); err == nil {
			t.Errorf("%s でエラーにならない", bad)
		}
	}
}

// orgServices は、組織ごとの calendar.Service を返す gcal.Services である。無い組織にはエラーを返す。
type orgServices map[string]*calendar.Service

func (s orgServices) Service(orgID string) (*calendar.Service, error) {
	svc, ok := s[orgID]
	if !ok {
		return nil, errors.New("組織のサービスアカウントの設定が無い")
	}
	return svc, nil
}

// 組織のカレンダーは、その組織のサービスアカウントで読み、別の組織のアカウントでは読まない。
func TestMonthUsesOrgService(t *testing.T) {
	srvA := gcaltest.NewServer(map[string]gcaltest.Calendar{"staff-a@example.com": {Summary: "職員A"}})
	srvB := gcaltest.NewServer(map[string]gcaltest.Calendar{"staff-b@example.com": {Summary: "職員B"}})
	r := gcal.NewReader(orgServices{"org-a": gcaltest.Start(t, srvA), "org-b": gcaltest.Start(t, srvB)}, []gcal.Calendar{
		{ID: "staff-a@example.com", OrgID: "org-a"},
		{ID: "staff-b@example.com", OrgID: "org-b"},
	})
	src, ok := r.Month("org-a", april(t))
	if !ok {
		t.Fatal("org-a のカレンダーが無い")
	}
	if _, _, err := src.Schedules(t.Context()); err != nil {
		t.Fatal(err)
	}
	if len(srvA.Queries()) != 1 || len(srvB.Queries()) != 0 {
		t.Errorf("リクエストの数: org-a のアカウント = %d, org-b のアカウント = %d", len(srvA.Queries()), len(srvB.Queries()))
	}
}

func TestMonthWithoutOrgService(t *testing.T) {
	r := gcal.NewReader(orgServices{}, []gcal.Calendar{{ID: "staff-a@example.com", OrgID: org}})
	_, _, err := mustMonth(t, r, april(t)).Schedules(t.Context())
	if _, ok := errors.AsType[*check.SourceError](err); !ok {
		t.Fatalf("err = %v, want *check.SourceError", err)
	}
}

// 通信のエラーの文に、カレンダー ID を含む URL を出さない。
func TestSchedulesSourceErrorHidesCalendarID(t *testing.T) {
	svc, err := calendar.NewService(t.Context(), option.WithEndpoint("http://127.0.0.1:1/"), option.WithoutAuthentication())
	if err != nil {
		t.Fatal(err)
	}
	r := gcal.NewReader(gcaltest.Same{Svc: svc}, []gcal.Calendar{{ID: "secret-staff@example.com", OrgID: org}})
	_, _, err = mustMonth(t, r, april(t)).Schedules(t.Context())
	if _, ok := errors.AsType[*check.SourceError](err); !ok {
		t.Fatalf("err = %v, want *check.SourceError", err)
	}
	if strings.Contains(err.Error(), "secret-staff") {
		t.Errorf("エラーの文にカレンダー ID が出ている: %v", err)
	}
}
