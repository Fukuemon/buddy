package login

import (
	"context"

	"github.com/Fukuemon/buddy/services/broker/internal/upstream"
)

// Upstream は、上流の IdP の RP の処理である。約束は upstream.RP と同じである。
type Upstream interface {
	AuthURL(ctx context.Context, orgID string, a upstream.Attempt, loginHint string) (string, error)
	Exchange(ctx context.Context, orgID, code, iss string, a upstream.Attempt) (upstream.Identity, error)
}
