// Package gcaltest は、テストに使う、Calendar API の偽物を提供する。
// 予定の読み出し（events.list、events.instances、events.get）と書き込み（events.insert、events.patch、events.delete）に答える。
// events.list は、syncToken による増分の取得にも答える。
package gcaltest

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"slices"
	"strconv"
	"sync"
	"testing"

	"google.golang.org/api/calendar/v3"
	"google.golang.org/api/option"
)

// Server は、Calendar API の偽物である。期間（timeMin、timeMax）では絞らない。
// 書き込みは、要求の If-Match が今の etag と違えば 412 を返し、書くたびに etag を新しくする。
// 全ての予定を読むと、最後のページに nextSyncToken を返す。syncToken を付けて読むと、そのトークンの後に変わった予定を、
// 消した予定も含めて 1 ページで返す。JSON から読んだ予定は、最初からあった予定として扱う。
type Server struct {
	// Calendars は、カレンダー ID ごとの、ページごとの予定である。2 ページ目以降は nextPageToken で返す。
	// 無いカレンダーには 404 を返す。作った予定は最後のページに足す。
	Calendars map[string][][]*calendar.Event `json:"calendars"`
	// Instances は、繰り返しの親の予定の ID ごとの回である。1 ページで返す。無い予定には 404 を返す。
	Instances map[string][]*calendar.Event `json:"instances"`
	// AccessRoles は、カレンダー ID ごとの応答の accessRole である。無ければ reader を返す。
	AccessRoles map[string]string `json:"accessRoles"`
	// Status が 0 でなければ、全ての要求にその状態の誤りの応答を返す。
	Status int `json:"status"`
	// Failures は、次からの書き込みの要求に順に返す誤りの状態である。返した値は消す。
	Failures []int `json:"failures"`

	mu      sync.Mutex
	queries []url.Values
	// deleted は、カレンダー ID ごとの消した予定である。同じ ID で作れず、更新で戻せる。
	deleted map[string]map[string]*calendar.Event
	etags   int
	writes  int
	// seq は、予定を変えるたびに 1 つ増える番号で、changed は、カレンダー ID と予定の ID ごとの、最後に変えたときの番号である。
	seq     int
	changed map[string]map[string]int
	// generation は、同期のトークンの世代で、ExpireSyncTokens で増える。違う世代のトークンには 410 を返す。
	generation int
}

// Queries は、予定を返した要求のクエリを、受けた順に返す。
func (s *Server) Queries() []url.Values {
	s.mu.Lock()
	defer s.mu.Unlock()
	return append([]url.Values(nil), s.queries...)
}

// Writes は、受けた書き込みの要求の数を返す。誤りを返した要求も数える。
func (s *Server) Writes() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.writes
}

// Event は、カレンダー calendarID の予定 eventID を、消した予定も含めて返す。無ければ nil を返す。
func (s *Server) Event(calendarID, eventID string) *calendar.Event {
	s.mu.Lock()
	defer s.mu.Unlock()
	if ev := s.find(calendarID, eventID); ev != nil {
		return ev
	}
	return s.deleted[calendarID][eventID]
}

// Edit は、Google カレンダーの画面で人が予定を直したときのように、予定 eventID に fn を当てて etag を新しくする。
// 予定が無ければ false を返す。
func (s *Server) Edit(calendarID, eventID string, fn func(*calendar.Event)) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	ev := s.find(calendarID, eventID)
	if ev == nil {
		return false
	}
	fn(ev)
	ev.Etag = s.nextETag()
	s.touch(calendarID, eventID)
	return true
}

// Put は、Google カレンダーの画面で人が予定を作るか、繰り返しの予定の 1 回を変えたときのように、予定 ev を足し、
// 同じ ID の予定があれば置き換える。etag は新しくする。
func (s *Server) Put(calendarID string, ev *calendar.Event) {
	s.mu.Lock()
	defer s.mu.Unlock()
	ev.Etag = s.nextETag()
	for i, page := range s.Calendars[calendarID] {
		for j, cur := range page {
			if cur.Id == ev.Id {
				s.Calendars[calendarID][i][j] = ev
				s.touch(calendarID, ev.Id)
				return
			}
		}
	}
	s.appendEvent(calendarID, ev)
	s.touch(calendarID, ev.Id)
}

// Delete は、Google カレンダーの画面で人が予定を消したときのように、予定 eventID を消す。予定が無ければ false を返す。
func (s *Server) Delete(calendarID, eventID string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	ev := s.find(calendarID, eventID)
	if ev == nil {
		return false
	}
	s.remove(calendarID, ev)
	return true
}

// ExpireSyncTokens は、これまでに返した同期のトークンを切らし、次に使われたときに 410 を返す。
func (s *Server) ExpireSyncTokens() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.generation++
}

// touch は、予定 eventID を変えたことを、増分の取得のために覚える。s.mu を持って呼ぶ。
func (s *Server) touch(calendarID, eventID string) {
	s.seq++
	if s.changed == nil {
		s.changed = map[string]map[string]int{}
	}
	if s.changed[calendarID] == nil {
		s.changed[calendarID] = map[string]int{}
	}
	s.changed[calendarID][eventID] = s.seq
}

// syncToken は、今の時点の同期のトークンを返す。s.mu を持って呼ぶ。
func (s *Server) syncToken() string {
	return fmt.Sprintf("g%d-%d", s.generation, s.seq)
}

// appendEvent は、予定 ev をカレンダーの最後のページに足す。s.mu を持って呼ぶ。
func (s *Server) appendEvent(calendarID string, ev *calendar.Event) {
	pages := s.Calendars[calendarID]
	if len(pages) == 0 {
		pages = [][]*calendar.Event{nil}
	}
	pages[len(pages)-1] = append(pages[len(pages)-1], ev)
	s.Calendars[calendarID] = pages
}

// remove は、予定 ev を一覧から除いて、消した予定にする。s.mu を持って呼ぶ。
func (s *Server) remove(calendarID string, ev *calendar.Event) {
	for i, page := range s.Calendars[calendarID] {
		for j, cur := range page {
			if cur == ev {
				s.Calendars[calendarID][i] = append(page[:j:j], page[j+1:]...)
			}
		}
	}
	ev.Status = "cancelled"
	ev.Etag = s.nextETag()
	if s.deleted == nil {
		s.deleted = map[string]map[string]*calendar.Event{}
	}
	if s.deleted[calendarID] == nil {
		s.deleted[calendarID] = map[string]*calendar.Event{}
	}
	s.deleted[calendarID][ev.Id] = ev
	s.touch(calendarID, ev.Id)
}

// find は、予定 eventID を、カレンダーのページと繰り返しの回から探す。s.mu を持って呼ぶ。
func (s *Server) find(calendarID, eventID string) *calendar.Event {
	for _, page := range s.Calendars[calendarID] {
		for _, ev := range page {
			if ev.Id == eventID {
				return ev
			}
		}
	}
	for _, items := range s.Instances {
		for _, ev := range items {
			if ev.Id == eventID {
				return ev
			}
		}
	}
	return nil
}

// nextETag は、新しい etag を返す。JSON から読んだ予定の etag と重ならないよう、w を前に付ける。
func (s *Server) nextETag() string {
	s.etags++
	return strconv.Quote("w" + strconv.Itoa(s.etags))
}

// Events は、カレンダー calendarID の消していない予定の写しを返す。繰り返しの回（Instances）は含めない。
func (s *Server) Events(calendarID string) []calendar.Event {
	s.mu.Lock()
	defer s.mu.Unlock()
	var out []calendar.Event
	for _, page := range s.Calendars[calendarID] {
		for _, ev := range page {
			out = append(out, *ev)
		}
	}
	return out
}

// ServeHTTP は、events.list に答える。
func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if s.Status != 0 {
		writeError(w, s.Status, "denied")
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	cal := r.PathValue("id")
	pages, ok := s.Calendars[cal]
	if !ok {
		writeError(w, http.StatusNotFound, "Not Found")
		return
	}
	q := r.URL.Query()
	if t := q.Get("syncToken"); t != "" {
		s.serveChanges(w, cal, t, q)
		return
	}
	page := 0
	if t := q.Get("pageToken"); t != "" {
		n, err := strconv.Atoi(t)
		if err != nil || n < 0 || n >= len(pages) {
			writeError(w, http.StatusBadRequest, "bad pageToken")
			return
		}
		page = n
	}
	s.queries = append(s.queries, q)
	body := calendar.Events{AccessRole: "reader"}
	if role, ok := s.AccessRoles[r.PathValue("id")]; ok {
		body.AccessRole = role
	}
	if page < len(pages) {
		body.Items = pages[page]
	}
	if page+1 < len(pages) {
		body.NextPageToken = strconv.Itoa(page + 1)
	} else {
		if q.Get("showDeleted") == "true" {
			body.Items = append(slices.Clone(body.Items), s.deletedEvents(cal)...)
		}
		body.NextSyncToken = s.syncToken()
	}
	writeJSON(w, http.StatusOK, body)
}

// serveChanges は、syncToken を付けた events.list に答える。s.mu を持って呼ぶ。
func (s *Server) serveChanges(w http.ResponseWriter, cal, token string, q url.Values) {
	var gen, since int
	if _, err := fmt.Sscanf(token, "g%d-%d", &gen, &since); err != nil || gen != s.generation {
		writeError(w, http.StatusGone, "Sync token is no longer valid, a full sync is required.")
		return
	}
	s.queries = append(s.queries, q)
	body := calendar.Events{AccessRole: "reader", NextSyncToken: token}
	if role, ok := s.AccessRoles[cal]; ok {
		body.AccessRole = role
	}
	body.Items = []*calendar.Event{}
	for _, page := range s.Calendars[cal] {
		for _, ev := range page {
			if s.changed[cal][ev.Id] > since {
				body.Items = append(body.Items, ev)
			}
		}
	}
	for _, ev := range s.deletedEvents(cal) {
		if s.changed[cal][ev.Id] > since {
			body.Items = append(body.Items, ev)
		}
	}
	body.NextSyncToken = s.syncToken()
	writeJSON(w, http.StatusOK, body)
}

// deletedEvents は、カレンダーの消した予定を ID の順に返す。s.mu を持って呼ぶ。
func (s *Server) deletedEvents(cal string) []*calendar.Event {
	ids := make([]string, 0, len(s.deleted[cal]))
	for id := range s.deleted[cal] {
		ids = append(ids, id)
	}
	slices.Sort(ids)
	out := make([]*calendar.Event, len(ids))
	for i, id := range ids {
		out[i] = s.deleted[cal][id]
	}
	return out
}

// serveInstances は、events.instances に答える。
func (s *Server) serveInstances(w http.ResponseWriter, r *http.Request) {
	if s.Status != 0 {
		writeError(w, s.Status, "denied")
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.Calendars[r.PathValue("id")]; !ok {
		writeError(w, http.StatusNotFound, "Not Found")
		return
	}
	items, ok := s.Instances[r.PathValue("event")]
	if !ok {
		writeError(w, http.StatusNotFound, "Not Found")
		return
	}
	s.queries = append(s.queries, r.URL.Query())
	writeJSON(w, http.StatusOK, calendar.Events{Items: items})
}

// serveGet は、events.get に答える。消した予定は status が cancelled で返る。
func (s *Server) serveGet(w http.ResponseWriter, r *http.Request) {
	if s.Status != 0 {
		writeError(w, s.Status, "denied")
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	cal, id := r.PathValue("id"), r.PathValue("event")
	ev := s.find(cal, id)
	if ev == nil {
		ev = s.deleted[cal][id]
	}
	if ev == nil {
		writeError(w, http.StatusNotFound, "Not Found")
		return
	}
	writeJSON(w, http.StatusOK, ev)
}

// beginWrite は、書き込みの要求を数え、返す誤りがあれば応答を書いて false を返す。s.mu を持って呼ぶ。
func (s *Server) beginWrite(w http.ResponseWriter, r *http.Request) bool {
	s.writes++
	if s.Status != 0 {
		writeError(w, s.Status, "denied")
		return false
	}
	if len(s.Failures) > 0 {
		status := s.Failures[0]
		s.Failures = s.Failures[1:]
		writeError(w, status, http.StatusText(status))
		return false
	}
	if _, ok := s.Calendars[r.PathValue("id")]; !ok {
		writeError(w, http.StatusNotFound, "Not Found")
		return false
	}
	return true
}

// serveInsert は、events.insert に答える。ID が無ければ決め、消した予定を含めて同じ ID があれば 409 を返す。
func (s *Server) serveInsert(w http.ResponseWriter, r *http.Request) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if !s.beginWrite(w, r) {
		return
	}
	var ev calendar.Event
	if err := json.NewDecoder(r.Body).Decode(&ev); err != nil {
		writeError(w, http.StatusBadRequest, "bad body")
		return
	}
	cal := r.PathValue("id")
	if ev.Id == "" {
		ev.Id = fmt.Sprintf("fake%d", s.etags+1)
	}
	if s.find(cal, ev.Id) != nil || s.deleted[cal][ev.Id] != nil {
		writeError(w, http.StatusConflict, "The requested identifier already exists.")
		return
	}
	ev.Etag = s.nextETag()
	if ev.Status == "" {
		ev.Status = "confirmed"
	}
	s.appendEvent(cal, &ev)
	s.touch(cal, ev.Id)
	writeJSON(w, http.StatusOK, &ev)
}

// servePatch は、events.patch に答える。本文にある項目だけを変える。消した予定は、status を confirmed にすると戻す。
func (s *Server) servePatch(w http.ResponseWriter, r *http.Request) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if !s.beginWrite(w, r) {
		return
	}
	cal, id := r.PathValue("id"), r.PathValue("event")
	ev, wasDeleted := s.find(cal, id), false
	if ev == nil {
		ev, wasDeleted = s.deleted[cal][id], true
	}
	if ev == nil {
		writeError(w, http.StatusNotFound, "Not Found")
		return
	}
	if m := r.Header.Get("If-Match"); m != "" && m != ev.Etag {
		writeError(w, http.StatusPreconditionFailed, "Precondition Failed")
		return
	}
	var raw map[string]json.RawMessage
	if err := json.NewDecoder(r.Body).Decode(&raw); err != nil {
		writeError(w, http.StatusBadRequest, "bad body")
		return
	}
	b, _ := json.Marshal(raw)
	var patch calendar.Event
	_ = json.Unmarshal(b, &patch)
	if _, ok := raw["summary"]; ok {
		ev.Summary = patch.Summary
	}
	if _, ok := raw["description"]; ok {
		ev.Description = patch.Description
	}
	if _, ok := raw["start"]; ok {
		ev.Start = patch.Start
	}
	if _, ok := raw["end"]; ok {
		ev.End = patch.End
	}
	if _, ok := raw["recurrence"]; ok {
		ev.Recurrence = patch.Recurrence
	}
	if _, ok := raw["extendedProperties"]; ok {
		ev.ExtendedProperties = patch.ExtendedProperties
	}
	if _, ok := raw["status"]; ok {
		ev.Status = patch.Status
	}
	ev.Etag = s.nextETag()
	if wasDeleted && ev.Status != "cancelled" {
		delete(s.deleted[cal], id)
		s.appendEvent(cal, ev)
	}
	s.touch(cal, id)
	writeJSON(w, http.StatusOK, ev)
}

// serveDelete は、events.delete に答える。消した予定は一覧から除き、もう一度消すと 410 を返す。
func (s *Server) serveDelete(w http.ResponseWriter, r *http.Request) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if !s.beginWrite(w, r) {
		return
	}
	cal, id := r.PathValue("id"), r.PathValue("event")
	if s.deleted[cal][id] != nil {
		writeError(w, http.StatusGone, "Resource has been deleted")
		return
	}
	ev := s.find(cal, id)
	if ev == nil {
		writeError(w, http.StatusNotFound, "Not Found")
		return
	}
	if m := r.Header.Get("If-Match"); m != "" && m != ev.Etag {
		writeError(w, http.StatusPreconditionFailed, "Precondition Failed")
		return
	}
	s.remove(cal, ev)
	w.WriteHeader(http.StatusNoContent)
}

// Handler は、Calendar API の経路に s を当てた http.Handler を返す。
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.Handle("GET /calendars/{id}/events", s)
	mux.HandleFunc("POST /calendars/{id}/events", s.serveInsert)
	mux.HandleFunc("GET /calendars/{id}/events/{event}", s.serveGet)
	mux.HandleFunc("PATCH /calendars/{id}/events/{event}", s.servePatch)
	mux.HandleFunc("DELETE /calendars/{id}/events/{event}", s.serveDelete)
	mux.HandleFunc("GET /calendars/{id}/events/{event}/instances", s.serveInstances)
	return mux
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]any{"error": map[string]any{"code": status, "message": message}})
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
