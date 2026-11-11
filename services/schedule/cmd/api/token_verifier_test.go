package main

import (
	"context"
	"errors"
	"log/slog"
	"testing"

	"github.com/Fukuemon/buddy/packages/go/oidc"

	"github.com/Fukuemon/buddy/services/schedule/internal/httpapi"
)

// TestTokenVerifierNotReady は、discovery をまだ読めていない間の Verify が httpapi.ErrVerifierNotReady を返し、
// 認証のミドルウェアが 401 ではなく 503 を返せることを確認する。
func TestTokenVerifierNotReady(t *testing.T) {
	// 終わった ctx を渡し、discovery を読まないままにする
	ctx, cancel := context.WithCancel(t.Context())
	cancel()
	v := tokenVerifier{oidc.StartVerifier(ctx, oidc.Config{Issuer: "http://127.0.0.1:1", Audience: "schedule"}, nil, slog.New(slog.DiscardHandler))}
	if _, err := v.Verify(t.Context(), "raw"); !errors.Is(err, httpapi.ErrVerifierNotReady) {
		t.Fatalf("Verify() = %v, want ErrVerifierNotReady", err)
	}
}
