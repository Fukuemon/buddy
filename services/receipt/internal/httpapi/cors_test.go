package httpapi

import (
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
)

const originDocs = "http://localhost:8000"

func newCORSHandler(origins ...string) http.Handler {
	return NewHandler(slog.New(slog.NewTextHandler(io.Discard, nil)), Config{MaxUploadBytes: 1 << 20, Verifier: fakeVerifier{}, Permission: fakePermission{}, AllowOrigins: origins})
}

// TestCORSPreflight は、許した Origin の事前のリクエスト（preflight）に、トークンなしで 204 と CORS のヘッダーを返すことを確認する。
func TestCORSPreflight(t *testing.T) {
	req := httptest.NewRequest(http.MethodOptions, "/v1/checks", nil)
	req.Header.Set("Origin", originDocs)
	req.Header.Set("Access-Control-Request-Method", http.MethodPost)
	req.Header.Set("Access-Control-Request-Headers", "authorization")
	rec := httptest.NewRecorder()
	newCORSHandler(originDocs).ServeHTTP(rec, req)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("status %d body %s", rec.Code, rec.Body)
	}
	for k, want := range map[string]string{
		"Access-Control-Allow-Origin":  originDocs,
		"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
		"Access-Control-Allow-Headers": "Authorization, Content-Type",
	} {
		if got := rec.Header().Get(k); got != want {
			t.Errorf("%s = %q, want %q", k, got, want)
		}
	}
}

// TestCORSActualRequest は、事前のリクエストでないリクエストに付ける CORS のヘッダーを確認する。
// 許した Origin なら、401 でも Access-Control-Allow-Origin を付ける。付けないと、ブラウザが 401 の本文を読ませない。
func TestCORSActualRequest(t *testing.T) {
	tests := []struct {
		name         string
		method, path string
		origin       string
		wantStatus   int
		wantOrigin   string
	}{
		{"許した Origin でトークンが無い", http.MethodPost, "/v1/checks", originDocs, http.StatusUnauthorized, originDocs},
		{"許した Origin で認証の要らないパス", http.MethodGet, "/healthz", originDocs, http.StatusOK, originDocs},
		{"Origin が無い", http.MethodGet, "/healthz", "", http.StatusOK, ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(tt.method, tt.path, nil)
			if tt.origin != "" {
				req.Header.Set("Origin", tt.origin)
			}
			rec := httptest.NewRecorder()
			newCORSHandler(originDocs).ServeHTTP(rec, req)
			if rec.Code != tt.wantStatus {
				t.Fatalf("status %d body %s", rec.Code, rec.Body)
			}
			if got := rec.Header().Get("Access-Control-Allow-Origin"); got != tt.wantOrigin {
				t.Errorf("Access-Control-Allow-Origin = %q", got)
			}
			if got := rec.Header().Get("Vary"); got != "Origin" {
				t.Errorf("Vary = %q", got)
			}
		})
	}
}

// TestCORSNotAllowed は、許さない Origin と、AllowOrigins が空のときに、CORS のヘッダーを付けず、事前のリクエストにもトークンを求めることを確認する。
func TestCORSNotAllowed(t *testing.T) {
	for _, tt := range []struct {
		name    string
		handler http.Handler
	}{
		{"許さない Origin", newCORSHandler("http://localhost:3000")},
		{"AllowOrigins が空", newCORSHandler()},
	} {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodOptions, "/v1/checks", nil)
			req.Header.Set("Origin", originDocs)
			req.Header.Set("Access-Control-Request-Method", http.MethodPost)
			rec := httptest.NewRecorder()
			tt.handler.ServeHTTP(rec, req)
			if rec.Code != http.StatusUnauthorized {
				t.Errorf("status %d", rec.Code)
			}
			if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "" {
				t.Errorf("Access-Control-Allow-Origin = %q", got)
			}
		})
	}
}
