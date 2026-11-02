package staff_test

import (
	"testing"

	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/staff"
	"github.com/Fukuemon/buddy/services/schedule/internal/inmem"
)

// TestDefaultGrants は、役職のデフォルトの権限ごとに 1 つの権限を作り、チームを対象にする権限だけに所属のチームを付けることを確認する。
func TestDefaultGrants(t *testing.T) {
	pos := organization.Position{Policies: []organization.Policy{
		{ID: "SELF", Code: organization.ScheduleSelfEdit},
		{ID: "TEAM-READ", Code: organization.ScheduleTeamRead, NeedsTarget: true},
		{ID: "MANAGE", Code: organization.StaffManage},
	}}
	got := staff.DefaultGrants(pos, "TEAM-B", &inmem.SeqIDs{})
	if len(got) != 3 {
		t.Fatalf("grants = %+v, want 3 件", got)
	}
	ids := map[string]bool{}
	for i, g := range got {
		if g.PolicyID != pos.Policies[i].ID {
			t.Errorf("grants[%d].PolicyID = %s, want %s", i, g.PolicyID, pos.Policies[i].ID)
		}
		ids[g.ID] = true
		for _, tg := range g.Targets {
			ids[tg.ID] = true
		}
	}
	if len(got[0].Targets) != 0 || len(got[2].Targets) != 0 {
		t.Errorf("チームを対象にしない権限に対象がある: %+v", got)
	}
	if len(got[1].Targets) != 1 || got[1].Targets[0].TeamID != "TEAM-B" || got[1].Targets[0].UserID != "" {
		t.Errorf("チームの閲覧の対象 = %+v, want 所属のチーム", got[1].Targets)
	}
	if len(ids) != 4 {
		t.Errorf("ID = %v, want 権限 3 と対象 1 の 4 つが重ならない", ids)
	}
}
