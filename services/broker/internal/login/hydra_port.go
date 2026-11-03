package login

import (
	"context"

	"github.com/Fukuemon/buddy/services/broker/internal/hydra"
)

// Hydra は、Hydra の admin API のログインと同意とログアウトの呼び出しである。約束は hydra.Client と同じである。
type Hydra interface {
	LoginRequest(ctx context.Context, challenge string) (hydra.LoginRequest, error)
	AcceptLogin(ctx context.Context, challenge string, body hydra.AcceptLogin) (string, error)
	RejectLogin(ctx context.Context, challenge string, body hydra.Rejection) (string, error)
	ConsentRequest(ctx context.Context, challenge string) (hydra.ConsentRequest, error)
	AcceptConsent(ctx context.Context, challenge string, body hydra.AcceptConsent) (string, error)
	RejectConsent(ctx context.Context, challenge string, body hydra.Rejection) (string, error)
	AcceptLogout(ctx context.Context, challenge string) (string, error)
}
