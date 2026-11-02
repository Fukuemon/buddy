package schedule

import (
	"testing"

	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/staff"
	"github.com/Fukuemon/buddy/services/schedule/internal/principal"
)

const (
	self      = "SELF"
	selfTeam  = "TEAM-A"
	other     = "OTHER"
	otherTeam = "TEAM-B"
)

func subject(grants ...staff.PolicyGrant) principal.Principal {
	return principal.Principal{Staff: staff.Detail{
		Summary:  staff.Summary{Staff: staff.Staff{ID: self, TeamID: selfTeam}},
		Policies: grants,
	}}
}

// TestCan は、7 つの権限ごとに、ほかの職員と自分の予定を見てよいか、編集してよいかを確認する。
func TestCan(t *testing.T) {
	tests := []struct {
		name      string
		grant     staff.PolicyGrant
		readOther bool
		editOther bool
		editSelf  bool
	}{
		{"権限なし", staff.PolicyGrant{}, false, false, false},
		{"自分の予定の編集", staff.PolicyGrant{PolicyCode: organization.ScheduleSelfEdit}, false, false, true},
		{"指定した職員の閲覧", staff.PolicyGrant{PolicyCode: organization.ScheduleUserRead, TargetUserIDs: []string{other}}, true, false, false},
		{"指定した職員の編集", staff.PolicyGrant{PolicyCode: organization.ScheduleUserEdit, TargetUserIDs: []string{other}}, true, true, false},
		{"指定したチームの閲覧", staff.PolicyGrant{PolicyCode: organization.ScheduleTeamRead, TargetTeamIDs: []string{otherTeam}}, true, false, false},
		{"指定したチームの編集", staff.PolicyGrant{PolicyCode: organization.ScheduleTeamEdit, TargetTeamIDs: []string{otherTeam}}, true, true, false},
		{"全ての閲覧", staff.PolicyGrant{PolicyCode: organization.ScheduleAllRead}, true, false, false},
		{"全ての編集", staff.PolicyGrant{PolicyCode: organization.ScheduleAllEdit}, true, true, true},
		{"対象の外の職員", staff.PolicyGrant{PolicyCode: organization.ScheduleUserEdit, TargetUserIDs: []string{"SOMEONE"}}, false, false, false},
		{"対象の外のチーム", staff.PolicyGrant{PolicyCode: organization.ScheduleTeamEdit, TargetTeamIDs: []string{selfTeam}}, false, false, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			p := subject(tt.grant)
			if got := CanRead(p, other, otherTeam); got != tt.readOther {
				t.Errorf("CanRead(ほかの職員) = %v", got)
			}
			if got := CanEdit(p, other, otherTeam); got != tt.editOther {
				t.Errorf("CanEdit(ほかの職員) = %v", got)
			}
			if !CanRead(p, self, selfTeam) {
				t.Error("CanRead(自分) = false, want 権限によらず true")
			}
			if got := CanEdit(p, self, selfTeam); got != tt.editSelf {
				t.Errorf("CanEdit(自分) = %v", got)
			}
		})
	}
}

func TestCanReadAll(t *testing.T) {
	for code, want := range map[organization.PolicyCode]bool{
		organization.ScheduleAllRead:  true,
		organization.ScheduleAllEdit:  true,
		organization.ScheduleTeamEdit: false,
		organization.ScheduleSelfEdit: false,
	} {
		if got := CanReadAll(subject(staff.PolicyGrant{PolicyCode: code})); got != want {
			t.Errorf("%s: CanReadAll() = %v", code, got)
		}
	}
}

// TestStaffManageDoesNotGrantSchedules は、職員の管理の権限が、ほかの職員の予定に及ばないことを確認する。
func TestStaffManageDoesNotGrantSchedules(t *testing.T) {
	p := subject(staff.PolicyGrant{PolicyCode: organization.StaffManage})
	if CanRead(p, other, otherTeam) || CanEdit(p, other, otherTeam) || CanReadAll(p) {
		t.Error("職員の管理の権限で、ほかの職員の予定を扱えた")
	}
}

// TestReadable は、自分は権限によらず入り、見てよい職員だけが入ることを確認する。
func TestReadable(t *testing.T) {
	members := []staff.Ref{{ID: self, TeamID: selfTeam}, {ID: other, TeamID: otherTeam}, {ID: "THIRD", TeamID: "TEAM-C"}}
	tests := []struct {
		name  string
		grant staff.PolicyGrant
		want  map[string]bool
	}{
		{"権限なし", staff.PolicyGrant{}, map[string]bool{self: true, other: false, "THIRD": false}},
		{"チーム B の閲覧", staff.PolicyGrant{PolicyCode: organization.ScheduleTeamRead, TargetTeamIDs: []string{otherTeam}}, map[string]bool{self: true, other: true, "THIRD": false}},
		{"一覧に無い職員", staff.PolicyGrant{PolicyCode: organization.ScheduleUserRead, TargetUserIDs: []string{"OUTSIDE"}}, map[string]bool{self: true, "OUTSIDE": false}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ok := readable(subject(tt.grant), members)
			for id, want := range tt.want {
				if got := ok(id); got != want {
					t.Errorf("readable(%s) = %v, want %v", id, got, want)
				}
			}
		})
	}
}
