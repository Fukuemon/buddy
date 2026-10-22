package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
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
