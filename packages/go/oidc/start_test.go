package oidc

import (
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"github.com/Fukuemon/buddy/packages/go/oidc/oidctest"
)

// stoppableIssuer は、up が false の間は 503 を返し、true になると iss の応答を返すサーバーである。止まった Hydra の代わりに使う。
func stoppableIssuer(t *testing.T) (*oidctest.Issuer, *atomic.Bool, *httptest.Server) {
	t.Helper()
	var up atomic.Bool
	var iss *oidctest.Issuer
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !up.Load() {
			http.Error(w, "down", http.StatusServiceUnavailable)
			return
		}
		iss.ServeHTTP(w, r)
	}))
	t.Cleanup(srv.Close)
	iss, err := oidctest.New(srv.URL)
	if err != nil {
		t.Fatal(err)
	}
	return iss, &up, srv
}

func TestStartVerifierBecomesReadyAfterIssuerComesBack(t *testing.T) {
	iss, up, srv := stoppableIssuer(t)
	s := startVerifier(t.Context(), Config{Issuer: iss.URL(), Audience: "schedule", OrgClaim: "org_id"},
		srv.Client(), slog.New(slog.NewTextHandler(io.Discard, nil)), 10*time.Millisecond)
	raw, err := iss.Sign(iss.Claims("schedule", "sub-1"))
	if err != nil {
		t.Fatal(err)
	}

	if err := s.Ready(); !errors.Is(err, ErrNotReady) {
		t.Fatalf("Ready() = %v, want ErrNotReady", err)
	}
	if _, err := s.Verify(t.Context(), raw); !errors.Is(err, ErrNotReady) {
		t.Fatalf("Verify() = %v, want ErrNotReady", err)
	}

	up.Store(true)
	deadline := time.Now().Add(5 * time.Second)
	for s.Ready() != nil {
		if time.Now().After(deadline) {
			t.Fatal("Issuer が戻った後も Ready にならない")
		}
		time.Sleep(10 * time.Millisecond)
	}
	id, err := s.Verify(t.Context(), raw)
	if err != nil {
		t.Fatal(err)
	}
	if id.Subject != "sub-1" {
		t.Errorf("Subject = %q", id.Subject)
	}
}

func TestStartingVerifierRejectsBadTokenAfterReady(t *testing.T) {
	iss, up, srv := stoppableIssuer(t)
	up.Store(true)
	s := startVerifier(t.Context(), Config{Issuer: iss.URL(), Audience: "schedule", OrgClaim: "org_id"},
		srv.Client(), slog.New(slog.NewTextHandler(io.Discard, nil)), 10*time.Millisecond)
	deadline := time.Now().Add(5 * time.Second)
	for s.Ready() != nil {
		if time.Now().After(deadline) {
			t.Fatal("Ready にならない")
		}
		time.Sleep(10 * time.Millisecond)
	}
	_, err := s.Verify(t.Context(), "not-a-jwt")
	if err == nil || errors.Is(err, ErrNotReady) {
		t.Fatalf("Verify() = %v, want token error", err)
	}
}
