// Command gcalhold は、ローカル環境の compose と E2E で、予定の API の Calendar API のリクエストを calendarpit に渡す中継である。本番のイメージには入れない。
//
// calendarpit に無い操作を 3 つ補う。
//
// POST /hold で止めている間は、増分の取得（syncToken を付けた events.list）に、
// calendarpit に渡さず、変わった予定が無いと答え、受け取ったトークンをそのまま返す。E2E が、予定の API が Google の変更を読む前に
// buddy の変更を書き出させるために使う。calendarpit のトークンは使っても消えないので、止めるのをやめた後の増分の取得が、止めていた間の変更を返す。
//
// POST /fail で失敗させている間は、指定したカレンダーの予定の取得（events.list）に、calendarpit に渡さず 503 を返す。
// E2E が、同期の失敗（unavailable）を予定のカレンダーの画面で確認するために使う。
//
// POST /break で壊している間は、指定したタイトルの予定の取得（events.list と events.get）の応答で、終了の日時を読めない値にして返す。
// E2E が、日時を読めない予定（calendarpit は作れない）を、予定のカレンダーの出せない予定の件数で確認するために使う（#672）。
// 予定の ID は作るまで分からず、作った直後の同期に間に合わないので、タイトルで指定する。
//
//	go run ./cmd/gcalhold -addr 127.0.0.1:8085 -upstream http://127.0.0.1:4173
//
// 予定の API は、GOOGLE_CALENDAR_ENDPOINT にこのサーバーの /calendar/v3/ を渡して呼ぶ。
// `gcalhold healthcheck` は、サーバーを起動せず、compose のコンテナの中で 8080 に動いているサーバーの GET /healthz を確認して終わる。
package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

func main() {
	if len(os.Args) > 1 && os.Args[1] == "healthcheck" {
		os.Exit(healthcheck())
	}
	addr := flag.String("addr", ":8080", "待ち受けるアドレス")
	upstream := flag.String("upstream", "http://calendarpit:4173", "calendarpit の URL")
	flag.Parse()

	target, err := url.Parse(*upstream)
	if err != nil {
		log.Fatalf("-upstream %q を読めない: %v", *upstream, err)
	}
	var holding atomic.Bool
	failing := &failingCalendars{ids: map[string]bool{}}
	broken := &brokenSummaries{titles: map[string]bool{}}
	proxy := &httputil.ReverseProxy{Rewrite: func(r *httputil.ProxyRequest) {
		r.SetURL(target)
		// brokenEnds が応答の JSON を書き換えるので、圧縮しない応答を受ける
		r.Out.Header.Del("Accept-Encoding")
	}}

	mux := http.NewServeMux()
	mux.Handle("/", failedReads(failing, heldChanges(&holding, brokenEnds(broken, proxy))))
	mux.HandleFunc("POST /hold", func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Hold bool `json:"hold"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		holding.Store(body.Hold)
		w.WriteHeader(http.StatusNoContent)
	})
	mux.HandleFunc("POST /fail", func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			CalendarID string `json:"calendar_id"`
			Fail       bool   `json:"fail"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.CalendarID == "" {
			http.Error(w, "calendar_id と fail を送る", http.StatusBadRequest)
			return
		}
		failing.set(body.CalendarID, body.Fail)
		w.WriteHeader(http.StatusNoContent)
	})
	mux.HandleFunc("POST /break", func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Summary string `json:"summary"`
			Break   bool   `json:"break"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Summary == "" {
			http.Error(w, "summary と break を送る", http.StatusBadRequest)
			return
		}
		broken.set(body.Summary, body.Break)
		w.WriteHeader(http.StatusNoContent)
	})
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusNoContent) })
	srv := &http.Server{Addr: *addr, Handler: mux, ReadHeaderTimeout: 5 * time.Second}
	log.Printf("listening on %s, upstream %s", *addr, target)
	log.Fatal(srv.ListenAndServe())
}

// heldChanges は、止めている間の増分の取得に、変わった予定が無いと答える。ほかのリクエストは next に渡す。
func heldChanges(holding *atomic.Bool, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token := r.URL.Query().Get("syncToken")
		if !holding.Load() || r.Method != http.MethodGet || token == "" || !strings.HasSuffix(r.URL.Path, "/events") {
			next.ServeHTTP(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"kind": "calendar#events", "accessRole": "owner", "items": []any{}, "nextSyncToken": token,
		})
	})
}

func healthcheck() int {
	c := http.Client{Timeout: 2 * time.Second}
	res, err := c.Get("http://127.0.0.1:8080/healthz")
	if err != nil {
		return 1
	}
	_ = res.Body.Close()
	if res.StatusCode != http.StatusNoContent {
		return 1
	}
	return 0
}

// failingCalendars は、予定の取得を失敗させるカレンダーの ID である。
type failingCalendars struct {
	mu  sync.Mutex
	ids map[string]bool
}

func (f *failingCalendars) set(id string, fail bool) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if fail {
		f.ids[id] = true
		return
	}
	delete(f.ids, id)
}

func (f *failingCalendars) has(id string) bool {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.ids[id]
}

// failedReads は、失敗させるカレンダーの予定の取得（GET .../calendars/{id}/events）に 503 を返す。ほかのリクエストは next に渡す。
func failedReads(failing *failingCalendars, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, rest, ok := strings.Cut(r.URL.Path, "/calendars/")
		id, tail, _ := strings.Cut(rest, "/")
		if !ok || r.Method != http.MethodGet || tail != "events" || !failing.has(id) {
			next.ServeHTTP(w, r)
			return
		}
		http.Error(w, `{"error":{"code":503,"message":"gcalhold: 失敗させている"}}`, http.StatusServiceUnavailable)
	})
}

// unreadableDateTime は、壊した予定の終了の日時に入れる、RFC 3339 で読めない値である。
const unreadableDateTime = "gcalhold: 日時ではない"

// brokenSummaries は、終了の日時を壊して返す予定のタイトルである。
type brokenSummaries struct {
	mu     sync.Mutex
	titles map[string]bool
}

func (b *brokenSummaries) set(summary string, broken bool) {
	b.mu.Lock()
	defer b.mu.Unlock()
	if broken {
		b.titles[summary] = true
		return
	}
	delete(b.titles, summary)
}

func (b *brokenSummaries) has(summary string) bool {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.titles[summary]
}

func (b *brokenSummaries) empty() bool {
	b.mu.Lock()
	defer b.mu.Unlock()
	return len(b.titles) == 0
}

// brokenEnds は、予定の取得（GET .../calendars/{id}/events と GET .../calendars/{id}/events/{event_id}）の成功の応答のうち、
// 壊すタイトルの予定の終了の日時を unreadableDateTime にして返す。ほかのリクエストと応答は、そのまま next に渡すか返す。
func brokenEnds(broken *brokenSummaries, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, rest, ok := strings.Cut(r.URL.Path, "/calendars/")
		parts := strings.Split(rest, "/")
		isRead := ok && r.Method == http.MethodGet && len(parts) >= 2 && parts[1] == "events" && len(parts) <= 3
		if !isRead || broken.empty() {
			next.ServeHTTP(w, r)
			return
		}
		buf := &bufferedResponse{header: http.Header{}, code: http.StatusOK}
		next.ServeHTTP(buf, r)
		body := buf.body.Bytes()
		if buf.code == http.StatusOK {
			body = breakEnds(body, broken)
		}
		for k, v := range buf.header {
			w.Header()[k] = v
		}
		w.Header().Del("Content-Length")
		w.WriteHeader(buf.code)
		_, _ = w.Write(body)
	})
}

// breakEnds は、予定の一覧（items）か 1 件の予定の JSON body のうち、壊すタイトルの予定の終了の日時を書き換えて返す。
// JSON を読めないときは body をそのまま返す。
func breakEnds(body []byte, broken *brokenSummaries) []byte {
	var doc map[string]any
	if err := json.Unmarshal(body, &doc); err != nil {
		return body
	}
	breakOne := func(ev map[string]any) {
		if s, _ := ev["summary"].(string); !broken.has(s) {
			return
		}
		end, _ := ev["end"].(map[string]any)
		if end == nil {
			end = map[string]any{}
		}
		delete(end, "date")
		end["dateTime"] = unreadableDateTime
		ev["end"] = end
	}
	if items, ok := doc["items"].([]any); ok {
		for _, it := range items {
			if ev, ok := it.(map[string]any); ok {
				breakOne(ev)
			}
		}
	} else {
		breakOne(doc)
	}
	out, err := json.Marshal(doc)
	if err != nil {
		return body
	}
	return out
}

// bufferedResponse は、next の応答を書き換える前に溜める http.ResponseWriter である。
type bufferedResponse struct {
	header http.Header
	code   int
	body   bytes.Buffer
}

func (b *bufferedResponse) Header() http.Header         { return b.header }
func (b *bufferedResponse) WriteHeader(code int)        { b.code = code }
func (b *bufferedResponse) Write(p []byte) (int, error) { return b.body.Write(p) }
