package internalapi

import "context"

// Hydra は、職員のログインのセッションと同意を取り消す Hydra の admin API の呼び出しである。約束は hydra.Client と同じである。
type Hydra interface {
	RevokeLoginSessions(ctx context.Context, subject string) error
	RevokeConsentSessions(ctx context.Context, subject string) error
}
