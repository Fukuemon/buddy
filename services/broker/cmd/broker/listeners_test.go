package main

import (
	"log/slog"
	"net/http"
	"net/http/httptest"
	"slices"
	"testing"

	"github.com/Fukuemon/buddy/services/broker/internal/config"
)

// 待ち受ける対象ごとに、ポートの組と、各ポートがログインの画面、内部の API、ヘルスチェックのどれを受けるかを確認する。
func TestListeners(t *testing.T) {
	const (
		loginCode    = http.StatusTeapot
		internalCode = http.StatusAccepted
	)
	login := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(loginCode) })
	internal := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(internalCode) })
	paths := []string{"/login", "/login/callback", "/consent", "/logout", "/internal/token-hook", "/internal/staff", "/readyz"}
	publicCodes := []int{loginCode, loginCode, loginCode, loginCode, http.StatusNotFound, http.StatusNotFound, http.StatusOK}
	internalCodes := []int{http.StatusNotFound, http.StatusNotFound, http.StatusNotFound, http.StatusNotFound, internalCode, internalCode, http.StatusOK}
	tests := []struct {
		name   string
		target config.ListenTarget
		ports  []string
		codes  [][]int
	}{
		{"both は PORT でログインの画面を、INTERNAL_PORT で内部の API を受ける", config.ListenBoth, []string{"8080", "8081"}, [][]int{publicCodes, internalCodes}},
		{"public は PORT でログインの画面だけを受ける", config.ListenPublic, []string{"8080"}, [][]int{publicCodes}},
		{"internal は PORT で内部の API だけを受ける", config.ListenInternal, []string{"8080"}, [][]int{internalCodes}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cfg := config.Config{Port: "8080", InternalPort: "8081", ListenTarget: tt.target}
			ls := listeners(cfg, slog.New(slog.DiscardHandler), nil, login, internal)
			var ports []string
			for _, l := range ls {
				ports = append(ports, l.port)
			}
			if !slices.Equal(ports, tt.ports) {
				t.Fatalf("ports = %v, want %v", ports, tt.ports)
			}
			for i, l := range ls {
				var codes []int
				for _, p := range paths {
					rec := httptest.NewRecorder()
					l.handler.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, p, nil))
					codes = append(codes, rec.Code)
				}
				if !slices.Equal(codes, tt.codes[i]) {
					t.Errorf("ポート %s の %v の code = %v, want %v", l.port, paths, codes, tt.codes[i])
				}
			}
		})
	}
}
