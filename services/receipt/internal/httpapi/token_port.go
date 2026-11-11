package httpapi

import (
	"context"

	"github.com/Fukuemon/buddy/packages/go/oidc"
)

// TokenVerifier は、Authorization ヘッダーの Bearer のトークンを検証する。検証に失敗したときはエラーを返す。
// 検証する準備ができていないときは、oidc.ErrNotReady を包んだエラーを返す。
type TokenVerifier interface {
	Verify(ctx context.Context, raw string) (oidc.Identity, error)
}
