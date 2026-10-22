// Command gcalhold は、ローカル環境の compose と E2E で、予定の API の Calendar API の要求を calendarpit に渡す中継である。本番のイメージには入れない。
//
// calendarpit に無い操作を 1 つだけ補う。POST /hold で止めている間は、増分の取得（syncToken を付けた events.list）に、
// calendarpit に渡さず、変わった予定が無いと答え、受け取ったトークンをそのまま返す。E2E が、予定の API が Google の変更を読む前に
// buddy の変更を書き出させるために使う。calendarpit のトークンは使っても切れないので、止めるのをやめた後の増分の取得が、止めていた間の変更を返す。
//
//	go run ./cmd/gcalhold -addr 127.0.0.1:8085 -upstream http://127.0.0.1:4173
//
// 予定の API は、GOOGLE_CALENDAR_ENDPOINT にこのサーバーの /calendar/v3/ を渡して呼ぶ。
// `gcalhold healthcheck` は、サーバーを起動せず、動いているサーバーの GET /healthz を確かめて終わる。
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
	proxy := &httputil.ReverseProxy{Rewrite: func(r *httputil.ProxyRequest) { r.SetURL(target) }}

	mux := http.NewServeMux()
	mux.Handle("/", heldChanges(&holding, proxy))
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
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusNoContent) })
	srv := &http.Server{Addr: *addr, Handler: mux, ReadHeaderTimeout: 5 * time.Second}
	log.Printf("listening on %s, upstream %s", *addr, target)
	log.Fatal(srv.ListenAndServe())
}

// heldChanges は、止めている間の増分の取得に、変わった予定が無いと答える。ほかの要求は next に渡す。
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
