// Package auth は、検証したトークンが示す利用者と、リクエストを送った職員を表す。
package auth

import (
	"context"
	"fmt"
	"slices"

	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/organization"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/staff"
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

// CanRead は、チーム teamID に属する職員 staffID の予定を見てよいかを返す。
// 自分の予定は、権限によらず見てよい。編集の権限は、同じ範囲の閲覧を含む。
func (p Principal) CanRead(staffID, teamID string) bool {
	return staffID == p.Staff.ID || p.allows(staffID, teamID, false)
}

// CanEdit は、チーム teamID に属する職員 staffID の予定を作り、変え、キャンセルしてよいかを返す。
func (p Principal) CanEdit(staffID, teamID string) bool {
	return p.allows(staffID, teamID, true)
}

// CanReadAll は、事業所の全ての職員の予定を見てよいかを返す。
func (p Principal) CanReadAll() bool {
	return slices.ContainsFunc(p.Staff.Policies, func(g staff.PolicyGrant) bool {
		return g.PolicyCode == organization.ScheduleAllRead || g.PolicyCode == organization.ScheduleAllEdit
	})
}

// CanManageStaff は、職員の権限を足し外し、役職を変えてよいかを返す。
func (p Principal) CanManageStaff() bool {
	return slices.ContainsFunc(p.Staff.Policies, func(g staff.PolicyGrant) bool {
		return g.PolicyCode == organization.StaffManage
	})
}

// RequireStaffManage は、ctx の職員が職員の管理の権限を持たないときに domain.ErrForbidden を返す。organization.Guard として機能のパッケージに渡す。
func RequireStaffManage(ctx context.Context) error {
	p, ok := PrincipalFrom(ctx)
	if !ok || !p.CanManageStaff() {
		return fmt.Errorf("%w: 職員を管理する権限がありません", domain.ErrForbidden)
	}
	return nil
}

// allows は、職員の権限（user_policies）だけを見て判定する。役職は見ない。
func (p Principal) allows(staffID, teamID string, edit bool) bool {
	for _, g := range p.Staff.Policies {
		var ok bool
		switch g.PolicyCode {
		case organization.ScheduleSelfEdit:
			ok = staffID == p.Staff.ID
		case organization.ScheduleAllEdit:
			ok = true
		case organization.ScheduleAllRead:
			ok = !edit
		case organization.ScheduleUserEdit:
			ok = slices.Contains(g.TargetUserIDs, staffID)
		case organization.ScheduleUserRead:
			ok = !edit && slices.Contains(g.TargetUserIDs, staffID)
		case organization.ScheduleTeamEdit:
			ok = slices.Contains(g.TargetTeamIDs, teamID)
		case organization.ScheduleTeamRead:
			ok = !edit && slices.Contains(g.TargetTeamIDs, teamID)
		}
		if ok {
			return true
		}
	}
	return false
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
