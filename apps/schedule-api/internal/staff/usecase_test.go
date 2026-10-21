package staff_test

import (
	"context"
	"errors"
	"testing"

	"github.com/Fukuemon/buddy/apps/schedule-api/internal/apperr"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/inmem"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/organization"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/staff"
)

const (
	facilityID      = inmem.FacilityID
	otherFacilityID = inmem.OtherFacilityID
	staffID         = inmem.StaffID
	companionID     = inmem.CompanionID
)

func allow(context.Context) error { return nil }

func deny(context.Context) error { return apperr.ErrForbidden }

func newService(s *inmem.Store, guard organization.Guard) *staff.Usecase {
	return staff.NewUsecase(staff.Repositories{
		Facilities: inmem.Facilities{Store: s}, Departments: inmem.Departments{Store: s}, Teams: inmem.Teams{Store: s},
		Positions: inmem.Positions{Store: s}, Policies: inmem.Policies{Store: s}, Staff: inmem.Staff{Store: s},
	}, &inmem.Tx{}, &inmem.SeqIDs{}, guard)
}

func TestStaffCreate(t *testing.T) {
	const depID, teamID, posID, otherDepID = "DEP", "TEAM", "POS", "OTHERDEP"
	setup := func() *inmem.Store {
		s := inmem.Seeded()
		s.Departments[depID] = organization.Department{ID: depID, FacilityID: facilityID}
		s.Departments[otherDepID] = organization.Department{ID: otherDepID, FacilityID: otherFacilityID}
		s.Teams[teamID] = organization.Team{ID: teamID, FacilityID: facilityID}
		s.Positions[posID] = organization.Position{ID: posID, FacilityID: facilityID,
			Policies: []organization.Policy{
				{ID: "P1", Code: organization.ScheduleSelfEdit},
				{ID: "P2", Code: organization.ScheduleTeamRead, NeedsTarget: true},
			}}
		return s
	}
	newUC := func(s *inmem.Store) *staff.Usecase {
		return staff.NewUsecase(staff.Repositories{
			Facilities: inmem.Facilities{Store: s}, Departments: inmem.Departments{Store: s}, Teams: inmem.Teams{Store: s},
			Positions: inmem.Positions{Store: s}, Policies: inmem.Policies{Store: s}, Staff: inmem.Staff{Store: s},
		}, &inmem.Tx{}, &inmem.SeqIDs{}, allow)
	}
	in := staff.CreateInput{
		FacilityID: facilityID, Username: "森 健太", Email: "kenta.mori@example.com",
		DepartmentID: depID, TeamID: teamID, PositionID: posID,
	}

	s := setup()
	got, err := newUC(s).Create(context.Background(), in)
	if err != nil {
		t.Fatal(err)
	}
	g := s.Grants[got.ID]
	if len(g) != 2 || g[0].PolicyID != "P1" || g[1].PolicyID != "P2" {
		t.Fatalf("grants = %+v", g)
	}
	if len(g[0].Targets) != 0 {
		t.Errorf("自分の予定の編集の対象 = %+v, want なし", g[0].Targets)
	}
	if ts := g[1].Targets; len(ts) != 1 || ts[0].TeamID != teamID || ts[0].UserID != "" || ts[0].ID == "" {
		t.Errorf("チームの閲覧の対象 = %+v, want 所属のチーム %s", ts, teamID)
	}

	if _, err := newUC(s).Create(context.Background(), in); !errors.Is(err, apperr.ErrConflict) ||
		err.Error() != "メール kenta.mori@example.com の職員はこの事業所にすでにいます" {
		t.Errorf("同じメール: err = %v, want メールの重なりの ErrConflict", err)
	}

	other := in
	other.DepartmentID = otherDepID
	if _, err := newUC(setup()).Create(context.Background(), other); !errors.Is(err, apperr.ErrInvalidInput) {
		t.Fatalf("err = %v, want ErrInvalidInput", err)
	}
}

func TestStaffChangePosition(t *testing.T) {
	const teamID, leaderID, otherPosID = "TEAM", "LEADER", "OTHERPOS"
	setup := func() *inmem.Store {
		s := inmem.Seeded()
		d := s.Staff[staffID]
		d.TeamID = teamID
		d.PositionID = "MEMBER"
		d.Policies = []staff.PolicyGrant{{UserPolicyID: "OLD", PolicyCode: organization.ScheduleUserRead, TargetUserIDs: []string{companionID}}}
		s.Staff[staffID] = d
		s.Positions[leaderID] = organization.Position{ID: leaderID, FacilityID: facilityID, Policies: []organization.Policy{
			{ID: "SELF", Code: organization.ScheduleSelfEdit},
			{ID: "TEAMEDIT", Code: organization.ScheduleTeamEdit, NeedsTarget: true},
		}}
		s.Positions[otherPosID] = organization.Position{ID: otherPosID, FacilityID: otherFacilityID}
		return s
	}
	newUC := func(s *inmem.Store) *staff.Usecase {
		return staff.NewUsecase(staff.Repositories{
			Facilities: inmem.Facilities{Store: s}, Departments: inmem.Departments{Store: s}, Teams: inmem.Teams{Store: s},
			Positions: inmem.Positions{Store: s}, Policies: inmem.Policies{Store: s}, Staff: inmem.Staff{Store: s},
		}, &inmem.Tx{}, &inmem.SeqIDs{}, allow)
	}
	ctx := context.Background()

	s := setup()
	got, err := newUC(s).ChangePosition(ctx, staffID, leaderID)
	if err != nil {
		t.Fatal(err)
	}
	if got.PositionID != leaderID {
		t.Errorf("PositionID = %s", got.PositionID)
	}
	g := s.Grants[staffID]
	if len(g) != 2 || g[0].PolicyID != "SELF" || g[1].PolicyID != "TEAMEDIT" {
		t.Fatalf("grants = %+v, want 新しい役職の既定だけ", g)
	}
	if ts := g[1].Targets; len(ts) != 1 || ts[0].TeamID != teamID {
		t.Errorf("チームの編集の対象 = %+v, want 所属のチーム", ts)
	}

	if _, err := newUC(setup()).ChangePosition(ctx, staffID, otherPosID); !errors.Is(err, apperr.ErrInvalidInput) {
		t.Errorf("別の事業所の役職: err = %v, want ErrInvalidInput", err)
	}
	if _, err := newUC(setup()).ChangePosition(ctx, staffID, "MISSING"); !errors.Is(err, apperr.ErrInvalidInput) {
		t.Errorf("無い役職: err = %v, want ErrInvalidInput", err)
	}
	if _, err := newUC(setup()).ChangePosition(ctx, "MISSING", leaderID); !errors.Is(err, apperr.ErrNotFound) {
		t.Errorf("無い職員: err = %v, want ErrNotFound", err)
	}
}

// grantStore は、職員 staffID（チーム TEAM）と、同じ事業所の職員 companionID、チーム TEAM と別の事業所のチーム OTHERTEAM、
// 権限 SELF（対象なし）、USER（職員を対象にする）、TEAM（チームを対象にする）を持つ store を返す。
func grantStore() *inmem.Store {
	s := inmem.Seeded()
	s.Teams["TEAM"] = organization.Team{ID: "TEAM", FacilityID: facilityID}
	s.Teams["OTHERTEAM"] = organization.Team{ID: "OTHERTEAM", FacilityID: otherFacilityID}
	s.Policies["SELF"] = organization.Policy{ID: "SELF", Code: organization.ScheduleSelfEdit, Name: "自分の予定の編集"}
	s.Policies["USER"] = organization.Policy{ID: "USER", Code: organization.ScheduleUserRead, NeedsTarget: true}
	s.Policies["TEAM"] = organization.Policy{ID: "TEAM", Code: organization.ScheduleTeamEdit, NeedsTarget: true}
	return s
}

func TestStaffAddGrant(t *testing.T) {
	ctx := context.Background()
	tests := []struct {
		name    string
		in      staff.GrantInput
		wantErr error
	}{
		{"対象なしの権限", staff.GrantInput{PolicyID: "SELF"}, nil},
		{"職員を対象にする権限", staff.GrantInput{PolicyID: "USER", TargetUserIDs: []string{companionID}}, nil},
		{"チームを対象にする権限", staff.GrantInput{PolicyID: "TEAM", TargetTeamIDs: []string{"TEAM"}}, nil},
		{"対象なしの権限に対象", staff.GrantInput{PolicyID: "SELF", TargetUserIDs: []string{companionID}}, apperr.ErrInvalidInput},
		{"職員の権限に対象なし", staff.GrantInput{PolicyID: "USER"}, apperr.ErrInvalidInput},
		{"職員の権限にチーム", staff.GrantInput{PolicyID: "USER", TargetTeamIDs: []string{"TEAM"}}, apperr.ErrInvalidInput},
		{"チームの権限に職員", staff.GrantInput{PolicyID: "TEAM", TargetUserIDs: []string{companionID}}, apperr.ErrInvalidInput},
		{"別の事業所の職員", staff.GrantInput{PolicyID: "USER", TargetUserIDs: []string{inmem.OtherStaffID}}, apperr.ErrInvalidInput},
		{"別の事業所のチーム", staff.GrantInput{PolicyID: "TEAM", TargetTeamIDs: []string{"OTHERTEAM"}}, apperr.ErrInvalidInput},
		{"重なる対象", staff.GrantInput{PolicyID: "USER", TargetUserIDs: []string{companionID, companionID}}, apperr.ErrInvalidInput},
		{"無い権限", staff.GrantInput{PolicyID: "MISSING"}, apperr.ErrInvalidInput},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := grantStore()
			_, err := newService(s, allow).AddGrant(ctx, staffID, tt.in)
			if tt.wantErr != nil {
				if !errors.Is(err, tt.wantErr) {
					t.Fatalf("err = %v, want %v", err, tt.wantErr)
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			g := s.Grants[staffID]
			if len(g) != 1 || g[0].PolicyID != tt.in.PolicyID || len(g[0].Targets) != len(tt.in.TargetUserIDs)+len(tt.in.TargetTeamIDs) {
				t.Errorf("grants = %+v", g)
			}
		})
	}

	s := grantStore()
	uc := newService(s, allow)
	if _, err := uc.AddGrant(ctx, staffID, staff.GrantInput{PolicyID: "SELF"}); err != nil {
		t.Fatal(err)
	}
	if _, err := uc.AddGrant(ctx, staffID, staff.GrantInput{PolicyID: "SELF"}); !errors.Is(err, apperr.ErrConflict) ||
		err.Error() != "職員はすでに権限 自分の予定の編集 を持っています" {
		t.Errorf("同じ権限を 2 回: err = %v, want 権限の重なりの ErrConflict", err)
	}
	if _, err := uc.AddGrant(ctx, "MISSING", staff.GrantInput{PolicyID: "SELF"}); !errors.Is(err, apperr.ErrNotFound) {
		t.Errorf("無い職員: err = %v, want ErrNotFound", err)
	}
}

func TestStaffRemoveGrant(t *testing.T) {
	ctx := context.Background()
	s := grantStore()
	d := s.Staff[staffID]
	d.Policies = []staff.PolicyGrant{{UserPolicyID: "UP1", PolicyID: "SELF"}}
	s.Staff[staffID] = d
	uc := newService(s, allow)
	if _, err := uc.RemoveGrant(ctx, staffID, "UP1"); err != nil {
		t.Fatal(err)
	}
	if len(s.Staff[staffID].Policies) != 0 {
		t.Errorf("Policies = %+v, want なし", s.Staff[staffID].Policies)
	}
	if _, err := uc.RemoveGrant(ctx, staffID, "UP1"); !errors.Is(err, apperr.ErrNotFound) {
		t.Errorf("外した権限をもう一度: err = %v, want ErrNotFound", err)
	}
}

// TestStaffManageForbidden は、職員の管理を許されない職員には、職員の登録と、権限と役職を変える操作が apperr.ErrForbidden を返すことを確かめる。
func TestStaffManageForbidden(t *testing.T) {
	ctx := context.Background()
	uc := newService(grantStore(), deny)
	if _, err := uc.AddGrant(ctx, staffID, staff.GrantInput{PolicyID: "SELF"}); !errors.Is(err, apperr.ErrForbidden) {
		t.Errorf("AddGrant: err = %v", err)
	}
	if _, err := uc.RemoveGrant(ctx, staffID, "UP1"); !errors.Is(err, apperr.ErrForbidden) {
		t.Errorf("RemoveGrant: err = %v", err)
	}
	if _, err := uc.ChangePosition(ctx, staffID, "POS"); !errors.Is(err, apperr.ErrForbidden) {
		t.Errorf("ChangePosition: err = %v", err)
	}
	if _, err := uc.Create(ctx, staff.CreateInput{FacilityID: facilityID, Username: "新人", Email: "new@example.com"}); !errors.Is(err, apperr.ErrForbidden) {
		t.Errorf("Create: err = %v", err)
	}
}
