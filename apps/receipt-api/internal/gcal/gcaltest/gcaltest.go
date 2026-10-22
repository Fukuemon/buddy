// Package gcaltest は、テストとローカル環境の確認に使う、Calendar API の events.list のフェイクを提供する。
package gcaltest

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"testing"

	"google.golang.org/api/calendar/v3"
	"google.golang.org/api/option"
)

// Calendar は、フェイクの API が返す 1 つのカレンダーである。
type Calendar struct {
	// Summary は、カレンダーの表示名である。
	Summary string
	// Pages は、ページごとの予定である。2 ページ目以降は nextPageToken で返す。
	Pages [][]*calendar.Event
}

// Server は、GET /calendars/{calendarId}/events だけに答えるフェイクの API である。
type Server struct {
	calendars map[string]Calendar

	mu      sync.Mutex
	queries []url.Values
}

// NewServer は、calendars を返す Server を作る。キーはカレンダー ID である。
func NewServer(calendars map[string]Calendar) *Server {
	return &Server{calendars: calendars}
}

// Queries は、受けたリクエストのクエリを受けた順に返す。
func (s *Server) Queries() []url.Values {
	s.mu.Lock()
	defer s.mu.Unlock()
	return append([]url.Values(nil), s.queries...)
}

// ServeHTTP は、events.list に答える。知らないカレンダーには 404 を返す。
func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	id, ok := strings.CutPrefix(r.URL.Path, "/calendars/")
	id, ok2 := strings.CutSuffix(id, "/events")
	cal, known := s.calendars[id]
	if r.Method != http.MethodGet || !ok || !ok2 || !known {
		http.Error(w, `{"error":{"code":404,"message":"Not Found"}}`, http.StatusNotFound)
		return
	}
	q := r.URL.Query()
	s.mu.Lock()
	s.queries = append(s.queries, q)
	s.mu.Unlock()

	page := 0
	if t := q.Get("pageToken"); t != "" {
		n, err := strconv.Atoi(t)
		if err != nil {
			http.Error(w, `{"error":{"code":400,"message":"bad pageToken"}}`, http.StatusBadRequest)
			return
		}
		page = n
	}
	body := calendar.Events{Summary: cal.Summary, TimeZone: q.Get("timeZone")}
	if page < len(cal.Pages) {
		body.Items = cal.Pages[page]
	}
	if page+1 < len(cal.Pages) {
		body.NextPageToken = strconv.Itoa(page + 1)
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(body)
}

// Start は、s を httptest のサーバーで動かし、そこへ向けた calendar.Service を返す。
// サーバーはテストの終わりに止める。
func Start(t testing.TB, s *Server) *calendar.Service {
	t.Helper()
	ts := httptest.NewServer(s)
	t.Cleanup(ts.Close)
	svc, err := calendar.NewService(t.Context(), option.WithEndpoint(ts.URL+"/"), option.WithHTTPClient(ts.Client()))
	if err != nil {
		t.Fatal(err)
	}
	return svc
}
