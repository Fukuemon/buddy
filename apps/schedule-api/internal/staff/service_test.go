package staff_test

import (
	"context"
	"errors"
	"testing"

	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain"
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
	newUC := func(s *inmem.Store) *staff.Service {
		return staff.NewService(staff.Repositories{
			Facilities: inmem.Facilities{Store: s}, Departments: inmem.Departments{Store: s}, Teams: inmem.Teams{Store: s},
			Positions: inmem.Positions{Store: s}, Staff: inmem.Staff{Store: s},
		}, &inmem.Tx{}, &inmem.SeqIDs{})
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

	other := in
	other.DepartmentID = otherDepID
	if _, err := newUC(setup()).Create(context.Background(), other); !errors.Is(err, domain.ErrInvalidInput) {
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
	newUC := func(s *inmem.Store) *staff.Service {
		return staff.NewService(staff.Repositories{
			Facilities: inmem.Facilities{Store: s}, Departments: inmem.Departments{Store: s}, Teams: inmem.Teams{Store: s},
			Positions: inmem.Positions{Store: s}, Staff: inmem.Staff{Store: s},
		}, &inmem.Tx{}, &inmem.SeqIDs{})
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

	if _, err := newUC(setup()).ChangePosition(ctx, staffID, otherPosID); !errors.Is(err, domain.ErrInvalidInput) {
		t.Errorf("別の事業所の役職: err = %v, want ErrInvalidInput", err)
	}
	if _, err := newUC(setup()).ChangePosition(ctx, staffID, "MISSING"); !errors.Is(err, domain.ErrInvalidInput) {
		t.Errorf("無い役職: err = %v, want ErrInvalidInput", err)
	}
	if _, err := newUC(setup()).ChangePosition(ctx, "MISSING", leaderID); !errors.Is(err, domain.ErrNotFound) {
		t.Errorf("無い職員: err = %v, want ErrNotFound", err)
	}
}
