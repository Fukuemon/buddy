package schedule

import (
	"fmt"
	"slices"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/principal"
	"github.com/Fukuemon/buddy/services/schedule/internal/staff"
)

// CanRead は、p が、チーム teamID に属する職員 staffID の予定を見てよいかを返す。
// 自分の予定は、権限によらず見てよい。編集の権限は、同じ範囲の閲覧を含む。
func CanRead(p principal.Principal, staffID, teamID string) bool {
	return staffID == p.Staff.ID || allows(p, staffID, teamID, false)
}

// CanEdit は、p が、チーム teamID に属する職員 staffID の予定を作り、変え、キャンセルしてよいかを返す。
func CanEdit(p principal.Principal, staffID, teamID string) bool {
	return allows(p, staffID, teamID, true)
}

// CanReadAll は、p が事業所の全ての職員の予定を見てよいかを返す。
func CanReadAll(p principal.Principal) bool {
	return slices.ContainsFunc(p.Staff.Policies, func(g staff.PolicyGrant) bool {
		return g.PolicyCode == organization.ScheduleAllRead || g.PolicyCode == organization.ScheduleAllEdit
	})
}

// allows は、職員の権限（user_policies）だけを見て判定する。役職は見ない。
func allows(p principal.Principal, staffID, teamID string, edit bool) bool {
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

// allow は、p が職員 st の予定を見てよいか（edit なら編集してよいか）を確かめ、許されないときは apperr.ErrForbidden を返す。
func allow(p principal.Principal, st staff.Ref, edit bool) error {
	if edit && !CanEdit(p, st.ID, st.TeamID) {
		return fmt.Errorf("%w: この職員の予定を編集する権限がありません", apperr.ErrForbidden)
	}
	if !edit && !CanRead(p, st.ID, st.TeamID) {
		return fmt.Errorf("%w: この職員の予定を見る権限がありません", apperr.ErrForbidden)
	}
	return nil
}

// readable は、事業所の職員 members のうち、p が予定を見てよい職員かを返す関数を返す。
func readable(p principal.Principal, members []staff.Ref) func(staffID string) bool {
	ok := map[string]bool{p.Staff.ID: true}
	for _, m := range members {
		if CanRead(p, m.ID, m.TeamID) {
			ok[m.ID] = true
		}
	}
	return func(staffID string) bool { return ok[staffID] }
}
