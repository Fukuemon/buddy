package staff_test

import (
	"context"
	"errors"
	"testing"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/audit"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/staff"
	"github.com/Fukuemon/buddy/services/schedule/internal/inmem"
)

// TestStaffAudit は、職員の権限を変える 5 つの操作が、成功したときに、操作した職員、対象の職員、相関 ID の記録を 1 行書き、
// 失敗したときと権限が変わらないときは書かないことを確認する（ADR-0042）。記録の前後の中身と、記録を書けないときに
// 権限の変更も戻ることは、DB の postgres のテストが確認する。
func TestStaffAudit(t *testing.T) {
	ctx := context.Background()
	const depID, teamID, newTeamID, posID, managerPosID = "DEP", "TEAM", "TEAM2", "POS", "MANAGER"
	setup := func() *inmem.Store {
		s := grantStore()
		s.Departments[depID] = organization.Department{ID: depID, FacilityID: facilityID}
		s.Teams[newTeamID] = organization.Team{ID: newTeamID, FacilityID: facilityID}
		s.Positions[posID] = organization.Position{ID: posID, FacilityID: facilityID, Policies: []organization.Policy{
			{ID: "SELF", Code: organization.ScheduleSelfEdit},
		}}
		s.Positions[managerPosID] = organization.Position{ID: managerPosID, FacilityID: facilityID, Policies: []organization.Policy{
			{ID: "MANAGE", Code: organization.StaffManage},
		}}
		d := s.Staff[staffID]
		d.DepartmentID, d.TeamID, d.PositionID = depID, teamID, posID
		d.Policies = []staff.PolicyGrant{{UserPolicyID: "UP1", PolicyID: "TEAM", PolicyCode: organization.ScheduleTeamEdit, TargetTeamIDs: []string{teamID}}}
		s.Staff[staffID] = d
		c := s.Staff[companionID]
		c.PositionID = managerPosID
		c.Policies = []staff.PolicyGrant{{UserPolicyID: "UP-C", PolicyCode: organization.StaffManage}}
		s.Staff[companionID] = c
		return s
	}
	uc := func(s *inmem.Store) app {
		return build(deps{
			Facilities: inmem.Facilities{Store: s}, Departments: inmem.Departments{Store: s}, Teams: inmem.Teams{Store: s},
			Positions: inmem.Positions{Store: s}, Policies: inmem.Policies{Store: s}, Staff: inmem.Staff{Store: s},
			Identities: inmem.NewIdentities(), Assignments: inmem.StaffAssignments{Store: s},
			Audits: inmem.PermissionAudits{Store: s},
		}, &inmem.Tx{}, &inmem.SeqIDs{}, allow)
	}
	// one は、s の記録が、companionID が target に action をした 1 行だけかを確認する。
	one := func(t *testing.T, s *inmem.Store, action audit.Action, target string) audit.Record {
		t.Helper()
		if len(s.PermissionAudits) != 1 {
			t.Fatalf("記録 = %+v, want 1 行", s.PermissionAudits)
		}
		r := s.PermissionAudits[0]
		if r.Action != action || r.ActorKind != audit.ActorStaff || r.ActorUserID != companionID || r.ActorOperator != "" ||
			r.TargetUserID != target || r.FacilityID != facilityID || r.RequestID != testRequestID {
			t.Errorf("記録 = %+v, want %s を %s が %s にした行", r, action, companionID, target)
		}
		return r
	}

	t.Run("職員を登録すると、変更の前を持たずに staff.create を書く", func(t *testing.T) {
		s := setup()
		got, err := uc(s).Create(ctx, staff.CreateInput{
			FacilityID: facilityID, Username: "森 健太", Email: "kenta.mori@example.com", DepartmentID: depID, TeamID: teamID, PositionID: posID,
		})
		if err != nil {
			t.Fatal(err)
		}
		if r := one(t, s, audit.StaffCreate, got.ID); r.Before != nil || r.After == nil {
			t.Errorf("before = %v, after = %v, want 変更の後だけ", r.Before, r.After)
		}
	})
	t.Run("権限を足すと grant.add を書く", func(t *testing.T) {
		s := setup()
		if _, err := uc(s).AddGrant(ctx, staffID, staff.GrantInput{PolicyID: "SELF"}); err != nil {
			t.Fatal(err)
		}
		one(t, s, audit.GrantAdd, staffID)
	})
	t.Run("権限を外すと、外す前の権限を before に持つ grant.remove を書く", func(t *testing.T) {
		s := setup()
		if _, err := uc(s).RemoveGrant(ctx, staffID, "UP1"); err != nil {
			t.Fatal(err)
		}
		r := one(t, s, audit.GrantRemove, staffID)
		want := audit.NewStaffState(posID, teamID, []audit.Grant{{Code: string(organization.ScheduleTeamEdit), TargetTeamIDs: []string{teamID}}})
		if before, ok := r.Before.(audit.StaffState); !ok || !before.Equal(want) {
			t.Errorf("before = %+v, want %+v", r.Before, want)
		}
		if after, ok := r.After.(audit.StaffState); !ok || len(after.Grants) != 0 {
			t.Errorf("after = %+v, want 権限が無い", r.After)
		}
	})
	t.Run("役職を変えると position.change を書く", func(t *testing.T) {
		s := setup()
		if _, err := uc(s).ChangePosition(ctx, staffID, managerPosID); err != nil {
			t.Fatal(err)
		}
		one(t, s, audit.PositionChange, staffID)
	})
	t.Run("最後の有効な管理者の役職を職員の管理の権限の無い役職に変える 409 では書かない", func(t *testing.T) {
		s := setup()
		if _, err := uc(s).ChangePosition(ctx, companionID, posID); !errors.Is(err, apperr.ErrConflict) {
			t.Fatalf("err = %v, want ErrConflict", err)
		}
		if len(s.PermissionAudits) != 0 {
			t.Errorf("記録 = %+v, want 書かない", s.PermissionAudits)
		}
	})
	t.Run("チームを変えて対象を移すと team.change を書く", func(t *testing.T) {
		s := setup()
		if _, err := uc(s).UpdateProfile(ctx, staffID, staff.Profile{Username: "青木 ひな", DepartmentID: depID, TeamID: newTeamID}); err != nil {
			t.Fatal(err)
		}
		r := one(t, s, audit.TeamChange, staffID)
		if after, ok := r.After.(audit.StaffState); !ok || after.TeamID != newTeamID || after.Grants[0].TargetTeamIDs[0] != newTeamID {
			t.Errorf("after = %+v, want 新しいチームに移った対象", r.After)
		}
	})
	t.Run("チームを変えても権限の対象が変わらなければ書かない", func(t *testing.T) {
		s := setup()
		d := s.Staff[staffID]
		d.Policies = []staff.PolicyGrant{{UserPolicyID: "UP1", PolicyCode: organization.ScheduleSelfEdit}}
		s.Staff[staffID] = d
		if _, err := uc(s).UpdateProfile(ctx, staffID, staff.Profile{Username: "青木 ひな", DepartmentID: depID, TeamID: newTeamID}); err != nil {
			t.Fatal(err)
		}
		if len(s.PermissionAudits) != 0 {
			t.Errorf("記録 = %+v, want 書かない", s.PermissionAudits)
		}
	})
	t.Run("名前だけを変えると書かない", func(t *testing.T) {
		s := setup()
		if _, err := uc(s).UpdateProfile(ctx, staffID, staff.Profile{Username: "青木 ひなた", DepartmentID: depID, TeamID: teamID}); err != nil {
			t.Fatal(err)
		}
		if len(s.PermissionAudits) != 0 {
			t.Errorf("記録 = %+v, want 書かない", s.PermissionAudits)
		}
	})
	t.Run("最後の有効な管理者から職員の管理の権限を外す 409 では書かない", func(t *testing.T) {
		s := setup()
		if _, err := uc(s).RemoveGrant(ctx, companionID, "UP-C"); !errors.Is(err, apperr.ErrConflict) {
			t.Fatalf("err = %v, want ErrConflict", err)
		}
		if len(s.PermissionAudits) != 0 {
			t.Errorf("記録 = %+v, want 書かない", s.PermissionAudits)
		}
	})
	t.Run("同じ権限を足す 409 では書かない", func(t *testing.T) {
		s := setup()
		if _, err := uc(s).AddGrant(ctx, staffID, staff.GrantInput{PolicyID: "TEAM", TargetTeamIDs: []string{teamID}}); !errors.Is(err, apperr.ErrConflict) {
			t.Fatalf("err = %v, want ErrConflict", err)
		}
		if len(s.PermissionAudits) != 0 {
			t.Errorf("記録 = %+v, want 書かない", s.PermissionAudits)
		}
	})
	t.Run("記録を書けなければ操作も失敗する", func(t *testing.T) {
		s := setup()
		failing := build(deps{
			Staff: inmem.Staff{Store: s}, Policies: inmem.Policies{Store: s}, Teams: inmem.Teams{Store: s},
			Audits: inmem.PermissionAudits{Store: s, Err: errors.New("書けない")},
		}, &inmem.Tx{}, &inmem.SeqIDs{}, allow)
		if _, err := failing.AddGrant(ctx, staffID, staff.GrantInput{PolicyID: "SELF"}); err == nil {
			t.Error("記録を書けないのに成功した")
		}
	})
	t.Run("リクエストを送った職員がいなければ書かずに失敗する", func(t *testing.T) {
		s := setup()
		addGrant := staff.NewAddGrant(inmem.Staff{Store: s}, inmem.Policies{Store: s}, inmem.Teams{Store: s},
			audit.NewRecorder(inmem.PermissionAudits{Store: s}, &inmem.SeqIDs{}, func(context.Context) (string, bool) { return "", false }),
			&inmem.Tx{}, &inmem.SeqIDs{}, allow)
		if _, err := addGrant.Do(withRequestID(ctx), staffID, staff.GrantInput{PolicyID: "SELF"}); !errors.Is(err, audit.ErrNoActor) || len(s.PermissionAudits) != 0 {
			t.Errorf("err = %v, 記録 = %+v, want ErrNoActor で書かない", err, s.PermissionAudits)
		}
	})
	t.Run("相関 ID が無ければ書かずに失敗する", func(t *testing.T) {
		s := setup()
		addGrant := staff.NewAddGrant(inmem.Staff{Store: s}, inmem.Policies{Store: s}, inmem.Teams{Store: s},
			audit.NewRecorder(inmem.PermissionAudits{Store: s}, &inmem.SeqIDs{}, func(context.Context) (string, bool) { return companionID, true }),
			&inmem.Tx{}, &inmem.SeqIDs{}, allow)
		if _, err := addGrant.Do(ctx, staffID, staff.GrantInput{PolicyID: "SELF"}); !errors.Is(err, audit.ErrNoRequestID) || len(s.PermissionAudits) != 0 {
			t.Errorf("err = %v, 記録 = %+v, want ErrNoRequestID で書かない", err, s.PermissionAudits)
		}
	})
}
