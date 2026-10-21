package principal_test

import (
	"context"
	"errors"
	"testing"

	"github.com/Fukuemon/buddy/apps/schedule-api/internal/apperr"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/organization"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/principal"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/staff"
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

// TestPrincipalCan は、7 つの権限ごとに、ほかの職員と自分の予定を見てよいか、編集してよいかを確かめる。
func TestPrincipalCan(t *testing.T) {
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
			if got := p.CanRead(other, otherTeam); got != tt.readOther {
				t.Errorf("CanRead(ほかの職員) = %v", got)
			}
			if got := p.CanEdit(other, otherTeam); got != tt.editOther {
				t.Errorf("CanEdit(ほかの職員) = %v", got)
			}
			if !p.CanRead(self, selfTeam) {
				t.Error("CanRead(自分) = false, want 権限によらず true")
			}
			if got := p.CanEdit(self, selfTeam); got != tt.editSelf {
				t.Errorf("CanEdit(自分) = %v", got)
			}
		})
	}
}

func TestPrincipalCanReadAll(t *testing.T) {
	for code, want := range map[organization.PolicyCode]bool{
		organization.ScheduleAllRead:  true,
		organization.ScheduleAllEdit:  true,
		organization.ScheduleTeamEdit: false,
		organization.ScheduleSelfEdit: false,
	} {
		if got := subject(staff.PolicyGrant{PolicyCode: code}).CanReadAll(); got != want {
			t.Errorf("%s: CanReadAll() = %v", code, got)
		}
	}
}

func TestRequireStaffManage(t *testing.T) {
	ctx := context.Background()
	if err := principal.RequireStaffManage(ctx); !errors.Is(err, apperr.ErrForbidden) {
		t.Errorf("職員がいない: err = %v", err)
	}
	if err := principal.RequireStaffManage(principal.With(ctx, subject(staff.PolicyGrant{PolicyCode: organization.ScheduleAllEdit}))); !errors.Is(err, apperr.ErrForbidden) {
		t.Errorf("予定の全ての編集だけ: err = %v", err)
	}
	if err := principal.RequireStaffManage(principal.With(ctx, subject(staff.PolicyGrant{PolicyCode: organization.StaffManage}))); err != nil {
		t.Errorf("職員の管理: err = %v", err)
	}
}

// TestStaffManageDoesNotGrantSchedules は、職員の管理の権限が、ほかの職員の予定に及ばないことを確かめる。
func TestStaffManageDoesNotGrantSchedules(t *testing.T) {
	p := subject(staff.PolicyGrant{PolicyCode: organization.StaffManage})
	if p.CanRead(other, otherTeam) || p.CanEdit(other, otherTeam) || p.CanReadAll() {
		t.Error("職員の管理の権限で、ほかの職員の予定を扱えた")
	}
}
