package httpapi

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/principal"
)

// TokenVerifier は、Authorization ヘッダーの Bearer のトークンを検証する。検証に失敗したときはエラーを返す。
type TokenVerifier interface {
	Verify(ctx context.Context, raw string) (principal.Identity, error)
}
