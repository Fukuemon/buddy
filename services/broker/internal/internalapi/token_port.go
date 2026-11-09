package internalapi

import (
	"context"

	"github.com/Fukuemon/buddy/packages/go/oidc"
)

// TokenVerifier は、内部の API を呼んだクライアントの access token を検証する。約束は oidc.Verifier と同じである。
type TokenVerifier interface {
	Verify(ctx context.Context, raw string) (oidc.Identity, error)
}
