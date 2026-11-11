package httpapi

import (
	"context"
	"errors"

	"github.com/Fukuemon/buddy/services/schedule/internal/principal"
)

// ErrVerifierNotReady は、TokenVerifier がトークンを検証する準備をまだ終えていないことを表す。
// Hydra の discovery の文書を読めるまで返す。トークンの誤りではないので、401 ではなく 503 にする（ADR-0044 の「冗長化」）。
var ErrVerifierNotReady = errors.New("トークンを検証する準備ができていません")

// TokenVerifier は、Authorization ヘッダーの Bearer のトークンを検証する。検証に失敗したときはエラーを返す。
// 検証する準備ができていないときは、ErrVerifierNotReady を包んだエラーを返す。
type TokenVerifier interface {
	Verify(ctx context.Context, raw string) (principal.Identity, error)
}
