package gcal_test

import (
	"errors"
	"os"
	"path/filepath"
	"testing"

	"google.golang.org/api/calendar/v3"

	"github.com/Fukuemon/buddy/apps/receipt-api/internal/check"
	"github.com/Fukuemon/buddy/apps/receipt-api/internal/gcal"
	"github.com/Fukuemon/buddy/apps/receipt-api/internal/gcal/gcaltest"
	"github.com/Fukuemon/buddy/apps/receipt-api/internal/record"
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

func TestSchedulesQuery(t *testing.T) {
	srv := gcaltest.NewServer(map[string]gcaltest.Calendar{"staff-a@example.com": {Summary: "職員B"}})
	r := gcal.NewReader(gcaltest.Start(t, srv), []gcal.Calendar{{ID: "staff-a@example.com"}})
	if _, _, err := r.Month(april(t)).Schedules(t.Context()); err != nil {
		t.Fatal(err)
	}
	qs := srv.Queries()
	if len(qs) != 1 {
		t.Fatalf("要求の数 = %d", len(qs))
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
		r := gcal.NewReader(gcaltest.Start(t, srv), []gcal.Calendar{{ID: "staff-a@example.com", StaffName: "職員B"}})
		m, err := gcal.ParseMonth(tt.month)
		if err != nil {
			t.Fatal(err)
		}
		if _, _, err := r.Month(m).Schedules(t.Context()); err != nil {
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
	r := gcal.NewReader(gcaltest.Start(t, srv), []gcal.Calendar{
		{ID: "staff-a@example.com"},
		{ID: "staff-b@example.com", StaffName: "職員E"},
	})
	recs, warns, err := r.Month(april(t)).Schedules(t.Context())
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

	wantWarns := []string{"bad-order", "no-client", "overnight"}
	if len(warns) != len(wantWarns) {
		t.Fatalf("warnings = %+v", warns)
	}
	for i, w := range warns {
		if w.EventID != wantWarns[i] || w.CalendarID != "staff-a@example.com" || w.Start == "" || w.Message == "" {
			t.Errorf("warnings[%d] = %+v", i, w)
		}
	}
	if len(srv.Queries()) != 3 {
		t.Errorf("要求の数 = %d。ページ送りで 2、もう 1 つのカレンダーで 1 になる", len(srv.Queries()))
	}
	if q := srv.Queries()[1]; q.Get("pageToken") != "1" {
		t.Errorf("2 つ目の要求の pageToken = %q", q.Get("pageToken"))
	}
}

func TestSchedulesSourceError(t *testing.T) {
	srv := gcaltest.NewServer(nil)
	r := gcal.NewReader(gcaltest.Start(t, srv), []gcal.Calendar{{ID: "unknown@example.com"}})
	_, _, err := r.Month(april(t)).Schedules(t.Context())
	var se *check.SourceError
	if !errors.As(err, &se) {
		t.Fatalf("err = %v", err)
	}
	var ie *record.InputError
	if errors.As(err, &ie) {
		t.Errorf("入力の誤りにしない: %v", err)
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
	cals, err := gcal.LoadCalendars(write(t, `[{"calendar_id":"staff-a@example.com","staff_name":"職員B"},{"calendar_id":"staff-b@example.com"}]`))
	if err != nil || len(cals) != 2 || cals[0].StaffName != "職員B" || cals[1].StaffName != "" {
		t.Errorf("= %+v, %v", cals, err)
	}
	for _, bad := range []string{
		`[]`,
		`[{"calendar_id":""}]`,
		`[{"calendar_id":"a@example.com"},{"calendar_id":"a@example.com"}]`,
		`[{"calendar_id":"a@example.com","name":"x"}]`,
		`{}`,
	} {
		if _, err := gcal.LoadCalendars(write(t, bad)); err == nil {
			t.Errorf("%s でエラーにならない", bad)
		}
	}
}
