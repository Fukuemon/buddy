// Package principal は、検証したトークンが示す利用者と、リクエストを送った職員を表す。
package principal

import (
	"context"
	"fmt"
	"slices"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/staff"
)

// Identity は、署名と有効期限を検証した access token の主張である。Subject はブローカーの職員の ID である。
// OrgID は、ID ブローカーの組織の ID で、トークンに組織がないときは空である。
type Identity struct {
	Subject string
	OrgID   string
}

// Principal は、リクエストを送った職員である。Staff.FacilityID は、トークンの組織に結び付けた事業所と一致する。
// 権限は Staff.Policies にある。予定の閲覧と編集の判定は schedule の permission.go にある。
type Principal struct {
	Staff staff.Detail
}

// CanManageStaff は、職員の権限を足し外し、役職を変えてよいかを返す。
func (p Principal) CanManageStaff() bool {
	return slices.ContainsFunc(p.Staff.Policies, func(g staff.PolicyGrant) bool {
		return g.PolicyCode == organization.StaffManage
	})
}

// RequireStaffManage は、ctx の職員が職員の管理の権限を持たないときに apperr.ErrForbidden を返す。organization.Guard として機能のパッケージに渡す。
func RequireStaffManage(ctx context.Context) error {
	p, ok := From(ctx)
	if !ok || !p.CanManageStaff() {
		return fmt.Errorf("%w: 職員を管理する権限がありません", apperr.ErrForbidden)
	}
	return nil
}

type principalKey struct{}

// With は、p を持つ ctx を返す。
func With(ctx context.Context, p Principal) context.Context {
	return context.WithValue(ctx, principalKey{}, p)
}

// From は、With で ctx に入れた職員を返す。入っていなければ false を返す。
func From(ctx context.Context) (Principal, bool) {
	p, ok := ctx.Value(principalKey{}).(Principal)
	return p, ok
}
