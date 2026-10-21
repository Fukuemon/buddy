// Package gcaltest は、テストと手元の compose に使う、Calendar API の events.list と events.instances の偽物を提供する。
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

// Server は、GET /calendars/{calendarId}/events と GET /calendars/{calendarId}/events/{eventId}/instances だけに答える
// Calendar API の偽物である。期間（timeMin、timeMax）では絞らない。
type Server struct {
	// Calendars は、カレンダー ID ごとの、ページごとの予定である。2 ページ目以降は nextPageToken で返す。
	// 無いカレンダーには 404 を返す。
	Calendars map[string][][]*calendar.Event `json:"calendars"`
	// Instances は、繰り返しの親の予定の ID ごとの回である。1 ページで返す。無い予定には 404 を返す。
	Instances map[string][]*calendar.Event `json:"instances"`
	// AccessRoles は、カレンダー ID ごとの応答の accessRole である。無ければ reader を返す。
	AccessRoles map[string]string `json:"accessRoles"`
	// Status が 0 でなければ、全ての要求にその状態の誤りの応答を返す。
	Status int `json:"status"`

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
	body := calendar.Events{AccessRole: "reader"}
	if role, ok := s.AccessRoles[r.PathValue("id")]; ok {
		body.AccessRole = role
	}
	if page < len(pages) {
		body.Items = pages[page]
	}
	if page+1 < len(pages) {
		body.NextPageToken = strconv.Itoa(page + 1)
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(body)
}

// serveInstances は、events.instances に答える。
func (s *Server) serveInstances(w http.ResponseWriter, r *http.Request) {
	if s.Status != 0 {
		writeError(w, s.Status, "denied")
		return
	}
	if _, ok := s.Calendars[r.PathValue("id")]; !ok {
		writeError(w, http.StatusNotFound, "Not Found")
		return
	}
	items, ok := s.Instances[r.PathValue("event")]
	if !ok {
		writeError(w, http.StatusNotFound, "Not Found")
		return
	}
	s.mu.Lock()
	s.queries = append(s.queries, r.URL.Query())
	s.mu.Unlock()
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(calendar.Events{Items: items})
}

// Handler は、Calendar API の経路に s を当てた http.Handler を返す。
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.Handle("GET /calendars/{id}/events", s)
	mux.HandleFunc("GET /calendars/{id}/events/{event}/instances", s.serveInstances)
	return mux
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
	ts := httptest.NewServer(s.Handler())
	t.Cleanup(ts.Close)
	svc, err := calendar.NewService(t.Context(), option.WithEndpoint(ts.URL+"/"), option.WithHTTPClient(ts.Client()))
	if err != nil {
		t.Fatal(err)
	}
	return svc
}
