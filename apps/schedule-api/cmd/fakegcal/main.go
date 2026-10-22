// Command fakegcal は、ローカル環境の compose と E2E で Google Calendar API の代わりに動くフェイクである。本番のイメージには入れない。
//
// 予定の読み出しと書き込みに答え、予定は -file の JSON（gcaltest.Server の形）から読む。期間では絞らない。
// 書いた予定はメモリの中にだけ持ち、止めると消える。GET /view は予定を並べる画面で、予定を Google の側で直す操作も持つ。
//
//	go run ./cmd/fakegcal -addr 127.0.0.1:8085 -file ../../compose/fake-google-calendar.json
//
// 予定の API は、GOOGLE_CALENDAR_ENDPOINT にこのサーバーの URL を渡して呼ぶ。
// `fakegcal healthcheck` は、サーバーを起動せず、動いているサーバーの GET /healthz を確かめて終わる。
package main

import (
	"encoding/json"
	"flag"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/Fukuemon/buddy/apps/schedule-api/internal/gcal/gcaltest"
)

func main() {
	if len(os.Args) > 1 && os.Args[1] == "healthcheck" {
		os.Exit(healthcheck())
	}
	addr := flag.String("addr", ":8080", "待ち受けるアドレス")
	file := flag.String("file", "/config/fake-google-calendar.json", "カレンダーごとの予定の JSON")
	flag.Parse()

	b, err := os.ReadFile(*file)
	if err != nil {
		log.Fatal(err)
	}
	var s gcaltest.Server
	if err := json.Unmarshal(b, &s); err != nil {
		log.Fatalf("%s を読めない: %v", *file, err)
	}
	mux := http.NewServeMux()
	mux.Handle("/", s.Handler())
	mux.HandleFunc("GET /view", viewHandler(&s))
	mux.HandleFunc("POST /view/shift", shiftHandler(&s))
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusNoContent) })
	srv := &http.Server{Addr: *addr, Handler: mux, ReadHeaderTimeout: 5 * time.Second}
	log.Printf("listening on %s", *addr)
	log.Fatal(srv.ListenAndServe())
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
