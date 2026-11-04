// Command gcalhold は、ローカル環境の compose と E2E で、予定の API の Calendar API のリクエストを calendarpit に渡す中継である。本番のイメージには入れない。
//
// calendarpit に無い操作を 2 つ補う。
//
// POST /hold で止めている間は、増分の取得（syncToken を付けた events.list）に、
// calendarpit に渡さず、変わった予定が無いと答え、受け取ったトークンをそのまま返す。E2E が、予定の API が Google の変更を読む前に
// buddy の変更を書き出させるために使う。calendarpit のトークンは使っても消えないので、止めるのをやめた後の増分の取得が、止めていた間の変更を返す。
//
// POST /fail で失敗させている間は、指定したカレンダーの予定の取得（events.list）に、calendarpit に渡さず 503 を返す。
// E2E が、同期の失敗（unavailable）を予定のカレンダーの画面で確認するために使う。
//
//	go run ./cmd/gcalhold -addr 127.0.0.1:8085 -upstream http://127.0.0.1:4173
//
// 予定の API は、GOOGLE_CALENDAR_ENDPOINT にこのサーバーの /calendar/v3/ を渡して呼ぶ。
// `gcalhold healthcheck` は、サーバーを起動せず、compose のコンテナの中で 8080 に動いているサーバーの GET /healthz を確認して終わる。
package main

import (
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
	proxy := &httputil.ReverseProxy{Rewrite: func(r *httputil.ProxyRequest) { r.SetURL(target) }}

	mux := http.NewServeMux()
	mux.Handle("/", failedReads(failing, heldChanges(&holding, proxy)))
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
