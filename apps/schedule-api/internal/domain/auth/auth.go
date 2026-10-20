// Package auth は、検証したトークンが示す利用者と、リクエストを送った職員を表す。
package auth

import (
	"context"

	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain/staff"
)

// Identity は、署名と有効期限を検証した access token の主張である。
// Email は、EmailVerified が true のときだけ、職員を結び付ける根拠に使える。
// OrgID は、認証のブローカーの組織の ID で、トークンに組織がないときは空である。
type Identity struct {
	Subject       string
	Email         string
	EmailVerified bool
	OrgID         string
}

// Principal は、リクエストを送った職員である。Staff.FacilityID は、トークンの組織に結び付けた事業所と一致する。
// 権限は Staff.Policies にある。
type Principal struct {
	Staff staff.Detail
}

type principalKey struct{}

// WithPrincipal は、p を持つ ctx を返す。
func WithPrincipal(ctx context.Context, p Principal) context.Context {
	return context.WithValue(ctx, principalKey{}, p)
}

// PrincipalFrom は、WithPrincipal で ctx に入れた職員を返す。入っていなければ false を返す。
func PrincipalFrom(ctx context.Context) (Principal, bool) {
	p, ok := ctx.Value(principalKey{}).(Principal)
	return p, ok
}
