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
	return NewHandler(slog.New(slog.NewTextHandler(io.Discard, nil)), Config{MaxUploadBytes: 1 << 20, Verifier: fakeVerifier{}, AllowOrigins: origins})
}

// TestCORSPreflight は、許した Origin の事前の要求に、トークンなしで 204 と CORS のヘッダーを返すことを確かめる。
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

// TestCORSActualRequest は、許した Origin の要求の応答に、401 でも Access-Control-Allow-Origin を付けることを確かめる。
// 付けないと、ブラウザが 401 の本文を読ませない。
func TestCORSActualRequest(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/v1/checks", nil)
	req.Header.Set("Origin", originDocs)
	rec := httptest.NewRecorder()
	newCORSHandler(originDocs).ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status %d", rec.Code)
	}
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != originDocs {
		t.Errorf("Access-Control-Allow-Origin = %q", got)
	}
}

// TestCORSNotAllowed は、許さない Origin と、AllowOrigins が空のときに、CORS のヘッダーを付けず、事前の要求にもトークンを求めることを確かめる。
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
