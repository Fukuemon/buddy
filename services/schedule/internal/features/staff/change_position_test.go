package staff_test

import (
	"context"
	"errors"
	"testing"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/staff"
	"github.com/Fukuemon/buddy/services/schedule/internal/inmem"
)

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
	newUC := func(s *inmem.Store) app {
		return build(deps{
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
		t.Fatalf("grants = %+v, want 新しい役職のデフォルトの権限だけ", g)
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
