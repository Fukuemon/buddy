package staff

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/audit"
)

// auditState は、職員 d の、監査の記録に持つ役職、チーム、権限と対象の全量を返す（ADR-0042）。
func auditState(d Detail) audit.StaffState {
	grants := make([]audit.Grant, 0, len(d.Policies))
	for _, g := range d.Policies {
		grants = append(grants, audit.Grant{Code: string(g.PolicyCode), TargetUserIDs: g.TargetUserIDs, TargetTeamIDs: g.TargetTeamIDs})
	}
	return audit.NewStaffState(d.PositionID, d.TeamID, grants)
}

// recordChange は、職員の権限を変える操作 action の記録を、変更の前の全量 before と、変更の後に読み直した職員 after で書く。
// before は、書く前に auditState で取る。職員の登録のように変更の前が無い操作では、nil にする。
func recordChange(ctx context.Context, rec audit.Recorder, action audit.Action, before *audit.StaffState, after Detail) error {
	e := audit.Entry{FacilityID: after.FacilityID, Action: action, TargetUserID: after.ID, After: auditState(after)}
	if before != nil {
		e.Before = *before
	}
	return rec.ByStaff(ctx, e)
}
