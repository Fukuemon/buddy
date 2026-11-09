package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
)

func TestHeldChanges(t *testing.T) {
	var passed int
	next := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		passed++
		w.WriteHeader(http.StatusTeapot)
	})
	var holding atomic.Bool
	h := heldChanges(&holding, next)
	const changes = "/calendar/v3/calendars/staff%40example.com/events?syncToken=t1&showDeleted=true"

	tests := []struct {
		name, method, target string
		hold, held           bool
	}{
		{name: "止めていなければ渡す", method: http.MethodGet, target: changes},
		{name: "止めていれば増分の取得に答える", method: http.MethodGet, target: changes, hold: true, held: true},
		{name: "止めていても全件の取得は渡す", method: http.MethodGet, target: "/calendar/v3/calendars/staff%40example.com/events?showDeleted=true", hold: true},
		{name: "止めていても書き込みは渡す", method: http.MethodPost, target: changes, hold: true},
		{name: "止めていても回の取得は渡す", method: http.MethodGet, target: "/calendar/v3/calendars/staff%40example.com/events/ev1/instances?syncToken=t1", hold: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			passed = 0
			holding.Store(tt.hold)
			rec := httptest.NewRecorder()
			h.ServeHTTP(rec, httptest.NewRequest(tt.method, tt.target, nil))
			if !tt.held {
				if passed != 1 || rec.Code != http.StatusTeapot {
					t.Fatalf("渡していない: passed=%d code=%d", passed, rec.Code)
				}
				return
			}
			var body struct {
				Items         []any  `json:"items"`
				NextSyncToken string `json:"nextSyncToken"`
			}
			if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
				t.Fatal(err)
			}
			if passed != 0 || rec.Code != http.StatusOK || len(body.Items) != 0 || body.NextSyncToken != "t1" {
				t.Fatalf("passed=%d code=%d body=%+v", passed, rec.Code, body)
			}
		})
	}
}

func TestFailedReads(t *testing.T) {
	var passed int
	next := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		passed++
		w.WriteHeader(http.StatusTeapot)
	})
	failing := &failingCalendars{ids: map[string]bool{}}
	h := failedReads(failing, next)
	const target = "/calendar/v3/calendars/staff%40example.com/events?syncToken=t1"

	tests := []struct {
		name, method, target string
		fail                 bool
		wantCode             int
	}{
		{name: "失敗させていなければ渡す", method: http.MethodGet, target: target, wantCode: http.StatusTeapot},
		{name: "失敗させていれば予定の取得に 503 を返す", method: http.MethodGet, target: target, fail: true, wantCode: http.StatusServiceUnavailable},
		{name: "失敗させていても書き込みは渡す", method: http.MethodPost, target: target, fail: true, wantCode: http.StatusTeapot},
		{name: "失敗させていても回の取得は渡す", method: http.MethodGet, target: "/calendar/v3/calendars/staff%40example.com/events/ev1/instances", fail: true, wantCode: http.StatusTeapot},
		{name: "ほかのカレンダーは渡す", method: http.MethodGet, target: "/calendar/v3/calendars/other%40example.com/events", fail: true, wantCode: http.StatusTeapot},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			passed = 0
			failing.set("staff@example.com", tt.fail)
			rec := httptest.NewRecorder()
			h.ServeHTTP(rec, httptest.NewRequest(tt.method, tt.target, nil))
			if rec.Code != tt.wantCode || (tt.wantCode == http.StatusTeapot) != (passed == 1) {
				t.Fatalf("code = %d, passed = %d, want %d", rec.Code, passed, tt.wantCode)
			}
		})
	}
}

// TestBrokenEnds は、壊すタイトルの予定の取得の応答で終了の日時を読めない値にし、ほかの予定、ほかのリクエスト、壊していないときは変えないことを確認する。
func TestBrokenEnds(t *testing.T) {
	const list = `{"items":[{"id":"a","summary":"壊す","end":{"dateTime":"2026-11-10T11:00:00+09:00"}},{"id":"b","summary":"残す","end":{"date":"2026-11-11"}}]}`
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Length", "999")
		if strings.HasSuffix(r.URL.Path, "/events/a") {
			_, _ = w.Write([]byte(`{"id":"a","summary":"壊す","end":{"date":"2026-11-11"}}`))
			return
		}
		_, _ = w.Write([]byte(list))
	})
	broken := &brokenSummaries{titles: map[string]bool{}}
	h := brokenEnds(broken, next)
	get := func(method, target string) string {
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequest(method, target, nil))
		return rec.Body.String()
	}
	ends := func(body string) map[string]any {
		var doc struct {
			Items []struct {
				ID  string         `json:"id"`
				End map[string]any `json:"end"`
			} `json:"items"`
			ID  string         `json:"id"`
			End map[string]any `json:"end"`
		}
		if err := json.Unmarshal([]byte(body), &doc); err != nil {
			t.Fatal(err)
		}
		out := map[string]any{}
		for _, it := range doc.Items {
			out[it.ID] = it.End
		}
		if doc.ID != "" {
			out[doc.ID] = doc.End
		}
		return out
	}
	const events = "/calendar/v3/calendars/staff%40example.com/events"
	if got := get(http.MethodGet, events); got != list {
		t.Errorf("壊していないときの一覧 = %s", got)
	}

	broken.set("壊す", true)
	got := ends(get(http.MethodGet, events))
	if got["a"].(map[string]any)["dateTime"] != unreadableDateTime || got["b"].(map[string]any)["date"] != "2026-11-11" {
		t.Errorf("一覧の終了 = %v", got)
	}
	one := ends(get(http.MethodGet, events+"/a"))["a"].(map[string]any)
	if one["dateTime"] != unreadableDateTime || one["date"] != nil {
		t.Errorf("1 件の取得の終了 = %v", one)
	}
	if body := get(http.MethodPost, events); body != list {
		t.Errorf("書き込みの応答を変えた: %s", body)
	}
	if body := get(http.MethodGet, events+"/a/instances"); body != list {
		t.Errorf("回の取得の応答を変えた: %s", body)
	}

	broken.set("壊す", false)
	if got := get(http.MethodGet, events); got != list {
		t.Errorf("戻した後の一覧 = %s", got)
	}
}
