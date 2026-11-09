package organization_test

import (
	"testing"

	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
)

func TestPolicyCodeIsTeamTarget(t *testing.T) {
	for code, want := range map[organization.PolicyCode]bool{
		organization.ScheduleTeamRead: true,
		organization.ScheduleTeamEdit: true,
		organization.ScheduleUserRead: false,
		organization.ScheduleAllEdit:  false,
		organization.ScheduleSelfEdit: false,
	} {
		if got := code.IsTeamTarget(); got != want {
			t.Errorf("%s.TargetsTeam() = %v", code, got)
		}
	}
}
