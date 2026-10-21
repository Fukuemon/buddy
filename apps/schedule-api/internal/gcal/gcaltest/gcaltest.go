// Package gcaltest は、テストに使う、Calendar API の events.list の偽物を提供する。
package gcaltest

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strconv"
	"sync"
	"testing"

	"google.golang.org/api/calendar/v3"
	"google.golang.org/api/option"
)

// Server は、GET /calendars/{calendarId}/events だけに答える Calendar API の偽物である。
type Server struct {
	// Calendars は、カレンダー ID ごとの、ページごとの予定である。2 ページ目以降は nextPageToken で返す。
	// 無いカレンダーには 404 を返す。
	Calendars map[string][][]*calendar.Event
	// Status が 0 でなければ、全ての要求にその状態の誤りの応答を返す。
	Status int

	mu      sync.Mutex
	queries []url.Values
}

// Queries は、予定を返した要求のクエリを、受けた順に返す。
func (s *Server) Queries() []url.Values {
	s.mu.Lock()
	defer s.mu.Unlock()
	return append([]url.Values(nil), s.queries...)
}

// ServeHTTP は、events.list に答える。
func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if s.Status != 0 {
		writeError(w, s.Status, "denied")
		return
	}
	pages, ok := s.Calendars[r.PathValue("id")]
	if !ok {
		writeError(w, http.StatusNotFound, "Not Found")
		return
	}
	q := r.URL.Query()
	page := 0
	if t := q.Get("pageToken"); t != "" {
		n, err := strconv.Atoi(t)
		if err != nil || n < 0 || n >= len(pages) {
			writeError(w, http.StatusBadRequest, "bad pageToken")
			return
		}
		page = n
	}
	s.mu.Lock()
	s.queries = append(s.queries, q)
	s.mu.Unlock()
	var body calendar.Events
	if page < len(pages) {
		body.Items = pages[page]
	}
	if page+1 < len(pages) {
		body.NextPageToken = strconv.Itoa(page + 1)
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(body)
}

func writeError(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{"error": map[string]any{"code": status, "message": message}})
}

// Start は、s を httptest のサーバーで動かし、そこへ向けた calendar.Service を返す。
// サーバーはテストの終わりに止める。
func Start(t testing.TB, s *Server) *calendar.Service {
	t.Helper()
	mux := http.NewServeMux()
	mux.Handle("GET /calendars/{id}/events", s)
	ts := httptest.NewServer(mux)
	t.Cleanup(ts.Close)
	svc, err := calendar.NewService(t.Context(), option.WithEndpoint(ts.URL+"/"), option.WithHTTPClient(ts.Client()))
	if err != nil {
		t.Fatal(err)
	}
	return svc
}
