package gcal_test

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"reflect"
	"strconv"
	"sync"
	"testing"
	"time"

	"google.golang.org/api/calendar/v3"
	"google.golang.org/api/googleapi"
	"google.golang.org/api/option"

	schedcal "github.com/Fukuemon/buddy/apps/schedule-api/internal/calendar"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/gcal"
)

// fakeAPI は、GET /calendars/{calendarId}/events だけに答える Calendar API の偽物である。
// pages をページごとに返し、status が 0 でなければその状態で誤りを返す。
type fakeAPI struct {
	pages  map[string][][]*calendar.Event
	status int

	mu      sync.Mutex
	queries []url.Values
}

func (f *fakeAPI) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if f.status != 0 {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(f.status)
		_, _ = w.Write([]byte(`{"error":{"code":` + strconv.Itoa(f.status) + `,"message":"denied"}}`))
		return
	}
	pages, ok := f.pages[r.PathValue("id")]
	if !ok {
		http.NotFound(w, r)
		return
	}
	q := r.URL.Query()
	f.mu.Lock()
	f.queries = append(f.queries, q)
	f.mu.Unlock()
	page := 0
	if t := q.Get("pageToken"); t != "" {
		page, _ = strconv.Atoi(t)
	}
	body := calendar.Events{Items: pages[page]}
	if page+1 < len(pages) {
		body.NextPageToken = strconv.Itoa(page + 1)
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(body)
}

func start(t *testing.T, f *fakeAPI) *gcal.Reader {
	t.Helper()
	mux := http.NewServeMux()
	mux.Handle("GET /calendars/{id}/events", f)
	ts := httptest.NewServer(mux)
	t.Cleanup(ts.Close)
	svc, err := calendar.NewService(t.Context(), option.WithEndpoint(ts.URL+"/"), option.WithHTTPClient(ts.Client()))
	if err != nil {
		t.Fatal(err)
	}
	return gcal.NewReader(svc)
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
	f := &fakeAPI{pages: map[string][][]*calendar.Event{
		"staff@example.com": {{parent, moved}, {cancelled}, {allDay}},
	}}

	got, err := start(t, f).Events(t.Context(), "staff@example.com", timeMin, timeMax)
	if err != nil {
		t.Fatal(err)
	}

	want := []schedcal.Event{
		{
			ID: "p1", ICalUID: "p1@google.com", Status: "confirmed", ETag: `"1"`, Summary: "【訪看I2】利用者A",
			Start:      schedcal.When{DateTime: "2026-10-06T10:00:00+09:00"},
			End:        schedcal.When{DateTime: "2026-10-06T11:00:00+09:00"},
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

	if len(f.queries) != 3 {
		t.Fatalf("要求の数 = %d, want 3", len(f.queries))
	}
	q := f.queries[0]
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
	if got := f.queries[2].Get("pageToken"); got != "2" {
		t.Errorf("3 ページ目の pageToken = %q, want 2", got)
	}
}

func TestReaderEventsError(t *testing.T) {
	for _, status := range []int{http.StatusForbidden, http.StatusNotFound} {
		t.Run(strconv.Itoa(status), func(t *testing.T) {
			r := start(t, &fakeAPI{status: status})
			_, err := r.Events(t.Context(), "staff@example.com", timeMin, timeMax)
			var gerr *googleapi.Error
			if !errors.As(err, &gerr) || gerr.Code != status {
				t.Fatalf("err = %v, want *googleapi.Error の %d", err, status)
			}
		})
	}
}

var _ schedcal.EventSource = (*gcal.Reader)(nil)
