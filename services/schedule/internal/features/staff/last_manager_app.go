package staff

import (
	"context"
	"slices"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
)

// lastManager は、cur が事業所で職員の管理の権限を持つ最後の有効な職員なら、msg の apperr.ErrConflict を返す。
// 戻す操作をする職員がいなくなると、DB を直すほかに戻せないためである（ADR-0016）。呼び出し側は、事業所をロックしてから呼ぶ。
func lastManager(ctx context.Context, staff Repository, cur Detail, msg string) error {
	if cur.Status() != StatusActive || !slices.ContainsFunc(cur.Policies, func(g PolicyGrant) bool {
		return g.PolicyCode == organization.StaffManage
	}) {
		return nil
	}
	managers, err := staff.ActiveManagers(ctx, cur.FacilityID)
	if err != nil {
		return err
	}
	if !slices.ContainsFunc(managers, func(m string) bool { return m != cur.ID }) {
		return apperr.Conflict("%s", msg)
	}
	return nil
}
