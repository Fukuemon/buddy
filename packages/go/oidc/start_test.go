package oidc

import (
	"context"
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
// discoveries は、discovery の文書への要求の数である。
func stoppableIssuer(t *testing.T) (iss *oidctest.Issuer, up *atomic.Bool, srv *httptest.Server, discoveries *atomic.Int32) {
	t.Helper()
	up, discoveries = &atomic.Bool{}, &atomic.Int32{}
	srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/.well-known/openid-configuration" {
			discoveries.Add(1)
		}
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
	return iss, up, srv, discoveries
}

func TestStartVerifierBecomesReadyAfterIssuerComesBack(t *testing.T) {
	iss, up, srv, _ := stoppableIssuer(t)
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
	iss, up, srv, _ := stoppableIssuer(t)
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

// TestStartVerifierStopsAfterReady は、1 度読めた後は discovery を読み直さないことを確認する。
func TestStartVerifierStopsAfterReady(t *testing.T) {
	iss, up, srv, discoveries := stoppableIssuer(t)
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
	time.Sleep(100 * time.Millisecond)
	if n := discoveries.Load(); n != 1 {
		t.Errorf("discovery の要求 = %d 回, want 1", n)
	}
}

// TestStartVerifierStopsOnCancel は、ctx が終わった後は discovery を読み直さないことを確認する。
func TestStartVerifierStopsOnCancel(t *testing.T) {
	iss, _, srv, discoveries := stoppableIssuer(t)
	ctx, cancel := context.WithCancel(t.Context())
	s := startVerifier(ctx, Config{Issuer: iss.URL(), Audience: "schedule", OrgClaim: "org_id"},
		srv.Client(), slog.New(slog.NewTextHandler(io.Discard, nil)), 10*time.Millisecond)
	deadline := time.Now().Add(5 * time.Second)
	for discoveries.Load() < 2 {
		if time.Now().After(deadline) {
			t.Fatal("読み直さない")
		}
		time.Sleep(5 * time.Millisecond)
	}
	cancel()
	time.Sleep(50 * time.Millisecond)
	n := discoveries.Load()
	time.Sleep(100 * time.Millisecond)
	if got := discoveries.Load(); got != n {
		t.Errorf("ctx が終わった後も読み直した: %d 回から %d 回", n, got)
	}
	if !errors.Is(s.Ready(), ErrNotReady) {
		t.Error("Ready になった")
	}
}
