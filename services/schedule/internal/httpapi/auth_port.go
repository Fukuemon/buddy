package httpapi

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/access"
	"github.com/Fukuemon/buddy/services/schedule/internal/principal"
)

// AuthApp は、認証のミドルウェアが使う操作である。
type AuthApp interface {
	Authenticate(ctx context.Context, id principal.Identity) (principal.Principal, error)
	FacilityOf(ctx context.Context, r access.Resource, id string) (string, error)
}
