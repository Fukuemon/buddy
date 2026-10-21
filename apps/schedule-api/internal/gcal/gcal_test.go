package gcal_test

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strconv"
	"strings"
	"testing"
	"time"

	"google.golang.org/api/calendar/v3"
	"google.golang.org/api/googleapi"
	"google.golang.org/api/option"

	schedcal "github.com/Fukuemon/buddy/apps/schedule-api/internal/calendar"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/gcal"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/gcal/gcaltest"
)

func start(t *testing.T, s *gcaltest.Server) *gcal.Reader {
	t.Helper()
	return gcal.NewReader(gcaltest.Start(t, s))
}

var (
	tokyo   = time.FixedZone("JST", 9*60*60)
	timeMin = time.Date(2026, 10, 1, 0, 0, 0, 0, tokyo)
	timeMax = time.Date(2026, 11, 1, 0, 0, 0, 0, tokyo)
)

func TestReaderEvents(t *testing.T) {
	parent := &calendar.Event{
		Id: "p1", ICalUID: "p1@google.com", Status: "confirmed", Etag: `"1"`, Summary: "【訪看I2】利用者A",
		Start:      &calendar.EventDateTime{DateTime: "2026-10-06T10:00:00+09:00", TimeZone: "Asia/Tokyo"},
		End:        &calendar.EventDateTime{DateTime: "2026-10-06T11:00:00+09:00", TimeZone: "Asia/Tokyo"},
		Recurrence: []string{"RRULE:FREQ=WEEKLY;BYDAY=TU", "EXDATE;TZID=Asia/Tokyo:20261013T100000"},
	}
	moved := &calendar.Event{
		Id: "p1_20261020T010000Z", ICalUID: "p1@google.com", Status: "confirmed", Etag: `"2"`, Summary: "【訪看I2】利用者A",
		Start:             &calendar.EventDateTime{DateTime: "2026-10-20T14:00:00+09:00"},
		End:               &calendar.EventDateTime{DateTime: "2026-10-20T15:00:00+09:00"},
		RecurringEventId:  "p1",
		OriginalStartTime: &calendar.EventDateTime{DateTime: "2026-10-20T10:00:00+09:00"},
	}
	cancelled := &calendar.Event{
		Id: "p1_20261027T010000Z", Status: "cancelled", RecurringEventId: "p1",
		OriginalStartTime: &calendar.EventDateTime{DateTime: "2026-10-27T10:00:00+09:00"},
	}
	allDay := &calendar.Event{
		Id: "d1", Status: "confirmed", Summary: "研修",
		Start: &calendar.EventDateTime{Date: "2026-10-15"}, End: &calendar.EventDateTime{Date: "2026-10-16"},
	}
	f := &gcaltest.Server{Calendars: map[string][][]*calendar.Event{
		"staff@example.com": {{parent, moved}, {cancelled}, {allDay}},
	}}

	got, err := start(t, f).Events(t.Context(), "staff@example.com", timeMin, timeMax)
	if err != nil {
		t.Fatal(err)
	}

	want := []schedcal.Event{
		{
			ID: "p1", ICalUID: "p1@google.com", Status: "confirmed", ETag: `"1"`, Summary: "【訪看I2】利用者A",
			Start:      schedcal.When{DateTime: "2026-10-06T10:00:00+09:00", TimeZone: "Asia/Tokyo"},
			End:        schedcal.When{DateTime: "2026-10-06T11:00:00+09:00", TimeZone: "Asia/Tokyo"},
			Recurrence: []string{"RRULE:FREQ=WEEKLY;BYDAY=TU", "EXDATE;TZID=Asia/Tokyo:20261013T100000"},
		},
		{
			ID: "p1_20261020T010000Z", ICalUID: "p1@google.com", Status: "confirmed", ETag: `"2"`, Summary: "【訪看I2】利用者A",
			Start:            schedcal.When{DateTime: "2026-10-20T14:00:00+09:00"},
			End:              schedcal.When{DateTime: "2026-10-20T15:00:00+09:00"},
			RecurringEventID: "p1",
			OriginalStart:    schedcal.When{DateTime: "2026-10-20T10:00:00+09:00"},
		},
		{
			ID: "p1_20261027T010000Z", Status: "cancelled", RecurringEventID: "p1",
			OriginalStart: schedcal.When{DateTime: "2026-10-27T10:00:00+09:00"},
		},
		{
			ID: "d1", Status: "confirmed", Summary: "研修",
			Start: schedcal.When{Date: "2026-10-15"}, End: schedcal.When{Date: "2026-10-16"},
		},
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("Events =\n%+v\nwant\n%+v", got, want)
	}

	queries := f.Queries()
	if len(queries) != 3 {
		t.Fatalf("要求の数 = %d, want 3", len(queries))
	}
	q := queries[0]
	for k, v := range map[string]string{
		"timeMin":      "2026-10-01T00:00:00+09:00",
		"timeMax":      "2026-11-01T00:00:00+09:00",
		"timeZone":     "Asia/Tokyo",
		"singleEvents": "false",
		"showDeleted":  "false",
	} {
		if got := q.Get(k); got != v {
			t.Errorf("%s = %q, want %q", k, got, v)
		}
	}
	if q.Has("orderBy") {
		t.Errorf("orderBy = %q, want なし（singleEvents=false では startTime で並べられない）", q.Get("orderBy"))
	}
	if got := queries[2].Get("pageToken"); got != "2" {
		t.Errorf("3 ページ目の pageToken = %q, want 2", got)
	}
}

func TestReaderEventsError(t *testing.T) {
	for status, kind := range map[int]error{
		http.StatusForbidden:           schedcal.ErrUnreadable,
		http.StatusNotFound:            schedcal.ErrUnreadable,
		http.StatusInternalServerError: schedcal.ErrUnavailable,
	} {
		t.Run(strconv.Itoa(status), func(t *testing.T) {
			r := start(t, &gcaltest.Server{Status: status})
			_, err := r.Events(t.Context(), "staff@example.com", timeMin, timeMax)
			var gerr *googleapi.Error
			if !errors.As(err, &gerr) || gerr.Code != status {
				t.Fatalf("err = %v, want *googleapi.Error の %d", err, status)
			}
			if !errors.Is(err, kind) {
				t.Errorf("err = %v, want %v を包む", err, kind)
			}
			if strings.Contains(err.Error(), "staff") {
				t.Errorf("err = %v, カレンダー ID を含む", err)
			}
		})
	}
}

func TestReaderInstances(t *testing.T) {
	inst := &calendar.Event{
		Id: "p1_20261006T010000Z", Status: "confirmed", Summary: "定例", RecurringEventId: "p1",
		Start:             &calendar.EventDateTime{DateTime: "2026-10-06T10:00:00+09:00"},
		End:               &calendar.EventDateTime{DateTime: "2026-10-06T11:00:00+09:00"},
		OriginalStartTime: &calendar.EventDateTime{DateTime: "2026-10-06T10:00:00+09:00"},
	}
	f := &gcaltest.Server{
		Calendars: map[string][][]*calendar.Event{"staff@example.com": {}},
		Instances: map[string][]*calendar.Event{"p1": {inst}},
	}
	r := start(t, f)
	got, err := r.Instances(t.Context(), "staff@example.com", "p1", timeMin, timeMax)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 || got[0].ID != inst.Id || got[0].RecurringEventID != "p1" || got[0].OriginalStart.DateTime != inst.OriginalStartTime.DateTime {
		t.Errorf("Instances = %+v", got)
	}
	q := f.Queries()[0]
	for k, v := range map[string]string{"timeZone": "Asia/Tokyo", "showDeleted": "false", "timeMin": timeMin.Format(time.RFC3339)} {
		if q.Get(k) != v {
			t.Errorf("%s = %q, want %q", k, q.Get(k), v)
		}
	}
	if _, err := r.Instances(t.Context(), "staff@example.com", "nope", timeMin, timeMax); !errors.Is(err, schedcal.ErrUnreadable) {
		t.Errorf("無い予定: err = %v, want ErrUnreadable", err)
	}
}

func TestReaderCheck(t *testing.T) {
	f := &gcaltest.Server{Calendars: map[string][][]*calendar.Event{"staff@example.com": {}}}
	r := start(t, f)
	if err := r.Check(t.Context(), "staff@example.com"); err != nil {
		t.Errorf("共有されたカレンダー: err = %v", err)
	}
	if got := f.Queries()[0].Get("maxResults"); got != "1" {
		t.Errorf("maxResults = %q, want 1", got)
	}
	err := r.Check(t.Context(), "other@example.com")
	if !errors.Is(err, schedcal.ErrUnreadable) || strings.Contains(err.Error(), "other") {
		t.Errorf("無いカレンダー: err = %v, want カレンダー ID を含まない ErrUnreadable", err)
	}
}

func TestReaderEventsTransportError(t *testing.T) {
	ts := httptest.NewServer(http.NotFoundHandler())
	ts.Close()
	svc, err := calendar.NewService(t.Context(), option.WithEndpoint(ts.URL+"/"), option.WithHTTPClient(ts.Client()))
	if err != nil {
		t.Fatal(err)
	}
	_, err = gcal.NewReader(svc).Events(t.Context(), "staff@example.com", timeMin, timeMax)
	if !errors.Is(err, schedcal.ErrUnavailable) || strings.Contains(err.Error(), "staff") {
		t.Fatalf("err = %v, want カレンダー ID を含まない ErrUnavailable", err)
	}
}

var _ schedcal.EventSource = (*gcal.Reader)(nil)

func TestReaderRejectsFreeBusy(t *testing.T) {
	f := &gcaltest.Server{
		Calendars:   map[string][][]*calendar.Event{"staff@example.com": {{}}},
		AccessRoles: map[string]string{"staff@example.com": "freeBusyReader"},
	}
	r := start(t, f)
	if err := r.Check(t.Context(), "staff@example.com"); !errors.Is(err, schedcal.ErrUnreadable) {
		t.Errorf("Check: err = %v, want ErrUnreadable", err)
	}
	if _, err := r.Events(t.Context(), "staff@example.com", timeMin, timeMax); !errors.Is(err, schedcal.ErrUnreadable) || strings.Contains(err.Error(), "staff") {
		t.Errorf("Events: err = %v, want カレンダー ID を含まない ErrUnreadable", err)
	}
}

func TestWriterErrorKinds(t *testing.T) {
	tests := []struct {
		name   string
		status int
		reason string
		want   error
	}{
		{"412", http.StatusPreconditionFailed, "conditionNotMet", schedcal.ErrEventChanged},
		{"404", http.StatusNotFound, "notFound", schedcal.ErrEventGone},
		{"410", http.StatusGone, "deleted", schedcal.ErrEventGone},
		{"409", http.StatusConflict, "duplicate", schedcal.ErrEventExists},
		{"400", http.StatusBadRequest, "invalid", schedcal.ErrUnwritable},
		{"共有の権限が無い 403", http.StatusForbidden, "forbidden", schedcal.ErrUnwritable},
		{"上限の 403", http.StatusForbidden, "rateLimitExceeded", schedcal.ErrUnavailable},
		{"429", http.StatusTooManyRequests, "rateLimitExceeded", schedcal.ErrUnavailable},
		{"500", http.StatusInternalServerError, "backendError", schedcal.ErrUnavailable},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(tt.status)
				_, _ = w.Write([]byte(`{"error":{"code":` + strconv.Itoa(tt.status) + `,"message":"x","errors":[{"reason":"` + tt.reason + `"}]}}`))
			}))
			defer ts.Close()
			svc, err := calendar.NewService(t.Context(), option.WithEndpoint(ts.URL+"/"), option.WithHTTPClient(ts.Client()))
			if err != nil {
				t.Fatal(err)
			}
			_, err = gcal.NewWriter(svc).Update(t.Context(), "staff@example.com", "ev1", `"1"`, schedcal.EventBody{})
			if !errors.Is(err, tt.want) {
				t.Errorf("err = %v, want %v", err, tt.want)
			}
			if strings.Contains(err.Error(), "staff@example.com") {
				t.Errorf("誤りの文がカレンダーの ID を含む: %v", err)
			}
		})
	}
}

func TestWriterSendsIfMatch(t *testing.T) {
	f := &gcaltest.Server{Calendars: map[string][][]*calendar.Event{"staff@example.com": {{
		{Id: "ev1", Etag: `"1"`, Status: "confirmed", Summary: "前"},
	}}}}
	w := gcal.NewWriter(gcaltest.Start(t, f))
	if _, err := w.Update(t.Context(), "staff@example.com", "ev1", `"old"`, schedcal.EventBody{Summary: "後"}); !errors.Is(err, schedcal.ErrEventChanged) {
		t.Fatalf("古い etag: err = %v", err)
	}
	etag, err := w.Update(t.Context(), "staff@example.com", "ev1", `"1"`, schedcal.EventBody{Summary: "後"})
	if err != nil || etag == `"1"` || f.Event("staff@example.com", "ev1").Summary != "後" {
		t.Fatalf("今の etag: etag = %q, err = %v", etag, err)
	}
	if err := w.Delete(t.Context(), "staff@example.com", "ev1", `"1"`); !errors.Is(err, schedcal.ErrEventChanged) {
		t.Errorf("古い etag の削除: err = %v", err)
	}
	if err := w.Delete(t.Context(), "staff@example.com", "ev1", etag); err != nil {
		t.Fatal(err)
	}
	if _, err := w.Insert(t.Context(), "staff@example.com", "ev1", schedcal.EventBody{Summary: "再"}); !errors.Is(err, schedcal.ErrEventExists) {
		t.Errorf("消した予定と同じ ID: err = %v", err)
	}
}
