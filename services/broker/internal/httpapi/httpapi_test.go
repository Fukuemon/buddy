package httpapi_test

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/Fukuemon/buddy/services/broker/internal/httpapi"
)

func TestHealth(t *testing.T) {
	down := func(context.Context) error { return errors.New("down") }
	up := func(context.Context) error { return nil }
	tests := []struct {
		name   string
		ready  func(context.Context) error
		path   string
		code   int
		status string
	}{
		{"healthz は依存先を確かめない", down, "/healthz", http.StatusOK, "ok"},
		{"readyz は依存先に届けば 200", up, "/readyz", http.StatusOK, "ok"},
		{"readyz は依存先に届かなければ 503", down, "/readyz", http.StatusServiceUnavailable, "unavailable"},
		{"Ready が nil の readyz は 200", nil, "/readyz", http.StatusOK, "ok"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			h := httpapi.NewHandler(httpapi.Config{Logger: slog.New(slog.DiscardHandler), Ready: tt.ready})
			rec := httptest.NewRecorder()
			h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, tt.path, nil))
			body, _ := io.ReadAll(rec.Body)
			if rec.Code != tt.code || !strings.Contains(string(body), `"status":"`+tt.status+`"`) {
				t.Errorf("got %d %s, want %d %s", rec.Code, body, tt.code, tt.status)
			}
			if ct := rec.Header().Get("Content-Type"); ct != "application/json" {
				t.Errorf("Content-Type = %q", ct)
			}
		})
	}
}

func TestUnknownPath(t *testing.T) {
	h := httpapi.NewHandler(httpapi.Config{Logger: slog.New(slog.DiscardHandler)})
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/login", nil))
	if rec.Code != http.StatusNotFound {
		t.Errorf("code = %d, want 404", rec.Code)
	}
}

func TestLoginRoutes(t *testing.T) {
	login := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusTeapot) })
	h := httpapi.NewHandler(httpapi.Config{Logger: slog.New(slog.DiscardHandler), Login: login})
	for _, path := range []string{"/login", "/login/callback", "/consent", "/logout"} {
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, path, nil))
		if rec.Code != http.StatusTeapot {
			t.Errorf("%s の code = %d, want ログインのハンドラ", path, rec.Code)
		}
	}
}

func TestInternalRoutes(t *testing.T) {
	internal := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusTeapot) })
	h := httpapi.NewHandler(httpapi.Config{Logger: slog.New(slog.DiscardHandler), Internal: internal})
	for _, path := range []string{"/internal/staff", "/internal/token-hook"} {
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, path, nil))
		if rec.Code != http.StatusTeapot {
			t.Errorf("%s の code = %d, want 内部の API のハンドラ", path, rec.Code)
		}
	}
}
