package staff_test

import (
	"context"
	"errors"
	"slices"
	"testing"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/staff"
	"github.com/Fukuemon/buddy/services/schedule/internal/inmem"
)

// TestStaffChangePosition は、役職を変えると、前の役職のデフォルトにある権限が対象ごと新しい役職のデフォルトに置き換わり、
// 職員ごとに足した権限は対象ごと残ることと、今と同じ役職では何も変わらないことを確認する（ADR-0041）。
func TestStaffChangePosition(t *testing.T) {
	const teamID, team2ID, memberID, leaderID, otherPosID = "TEAM", "TEAM2", "MEMBER", "LEADER", "OTHERPOS"
	// setup は、メンバーの職員 staffID を返す。メンバーのデフォルトは SELF と TEAMREAD で、TEAMREAD の対象を職員ごとに team2ID まで広げ、
	// 職員ごとに USER（companionID が対象）と TEAMEDIT（team2ID が対象）を足している。リーダーのデフォルトは SELF と TEAMEDIT である。
	setup := func() *inmem.Store {
		s := inmem.Seeded()
		d := s.Staff[staffID]
		d.TeamID = teamID
		d.PositionID = memberID
		d.Policies = []staff.PolicyGrant{
			{UserPolicyID: "UP-SELF", PolicyID: "SELF", PolicyCode: organization.ScheduleSelfEdit},
			{UserPolicyID: "UP-TEAMREAD", PolicyID: "TEAMREAD", PolicyCode: organization.ScheduleTeamRead, TargetTeamIDs: []string{teamID, team2ID}},
			{UserPolicyID: "UP-USER", PolicyID: "USER", PolicyCode: organization.ScheduleUserRead, TargetUserIDs: []string{companionID}},
			{UserPolicyID: "UP-TEAMEDIT", PolicyID: "TEAMEDIT", PolicyCode: organization.ScheduleTeamEdit, TargetTeamIDs: []string{team2ID}},
		}
		s.Staff[staffID] = d
		s.Positions[memberID] = organization.Position{ID: memberID, FacilityID: facilityID, Policies: []organization.Policy{
			{ID: "SELF", Code: organization.ScheduleSelfEdit},
			{ID: "TEAMREAD", Code: organization.ScheduleTeamRead, NeedsTarget: true},
		}}
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

	t.Run("職員ごとに足した権限と対象が残り、前の役職のデフォルトの権限が新しい役職のデフォルトに置き換わる", func(t *testing.T) {
		s := setup()
		got, err := newUC(s).ChangePosition(ctx, staffID, leaderID)
		if err != nil {
			t.Fatal(err)
		}
		if got.PositionID != leaderID {
			t.Errorf("PositionID = %s", got.PositionID)
		}
		kept := s.Staff[staffID].Policies
		if len(kept) != 2 || kept[0].UserPolicyID != "UP-USER" || !slices.Equal(kept[0].TargetUserIDs, []string{companionID}) ||
			kept[1].UserPolicyID != "UP-TEAMEDIT" || !slices.Equal(kept[1].TargetTeamIDs, []string{team2ID}) {
			t.Errorf("残った権限 = %+v, want 職員ごとに足した USER と TEAMEDIT が対象ごと残る", kept)
		}
		g := s.Grants[staffID]
		if len(g) != 1 || g[0].PolicyID != "SELF" {
			t.Errorf("コピーした権限 = %+v, want SELF だけ。対象を直した TEAMREAD は消え、職員ごとに足した TEAMEDIT はコピーしない", g)
		}
	})
	t.Run("新しい役職のチームの権限は、職員の所属のチームを対象にする", func(t *testing.T) {
		s := setup()
		d := s.Staff[staffID]
		d.Policies = d.Policies[:3]
		s.Staff[staffID] = d
		if _, err := newUC(s).ChangePosition(ctx, staffID, leaderID); err != nil {
			t.Fatal(err)
		}
		g := s.Grants[staffID]
		if len(g) != 2 || g[1].PolicyID != "TEAMEDIT" || len(g[1].Targets) != 1 || g[1].Targets[0].TeamID != teamID {
			t.Errorf("コピーした権限 = %+v, want TEAMEDIT が所属のチームを対象にする", g)
		}
	})
	t.Run("今と同じ役職に変えると成功し、職員ごとに直した対象を含めて権限が変わらない", func(t *testing.T) {
		s := setup()
		want := slices.Clone(s.Staff[staffID].Policies)
		got, err := newUC(s).ChangePosition(ctx, staffID, memberID)
		if err != nil {
			t.Fatal(err)
		}
		if got.PositionID != memberID {
			t.Errorf("PositionID = %s", got.PositionID)
		}
		if p := s.Staff[staffID].Policies; len(p) != len(want) || !slices.EqualFunc(p, want, func(a, b staff.PolicyGrant) bool {
			return a.UserPolicyID == b.UserPolicyID && slices.Equal(a.TargetTeamIDs, b.TargetTeamIDs) && slices.Equal(a.TargetUserIDs, b.TargetUserIDs)
		}) {
			t.Errorf("権限 = %+v, want 変わらない", p)
		}
		if g := s.Grants[staffID]; len(g) != 0 {
			t.Errorf("コピーした権限 = %+v, want 無い", g)
		}
	})

	if _, err := newUC(setup()).ChangePosition(ctx, staffID, otherPosID); !errors.Is(err, apperr.ErrInvalidInput) {
		t.Errorf("別の事業所の役職: err = %v, want ErrInvalidInput", err)
	}
	if _, err := newUC(setup()).ChangePosition(ctx, staffID, "MISSING"); !errors.Is(err, apperr.ErrInvalidInput) {
		t.Errorf("無い役職: err = %v, want ErrInvalidInput", err)
	}
	if _, err := newUC(setup()).ChangePosition(ctx, "MISSING", leaderID); !errors.Is(err, apperr.ErrNotFound) {
		t.Errorf("無い職員: err = %v, want ErrNotFound", err)
	}
	t.Run("職員の今の役職が見つからなければ、404 と読まれない内部のエラーを返し、何も書かない", func(t *testing.T) {
		s := setup()
		delete(s.Positions, memberID)
		want := slices.Clone(s.Staff[staffID].Policies)
		_, err := newUC(s).ChangePosition(ctx, staffID, leaderID)
		if err == nil || errors.Is(err, apperr.ErrNotFound) || errors.Is(err, apperr.ErrInvalidInput) || errors.Is(err, apperr.ErrConflict) {
			t.Errorf("err = %v, want apperr のどのエラーにも当たらない内部のエラー", err)
		}
		if d := s.Staff[staffID]; d.PositionID != memberID || len(d.Policies) != len(want) || len(s.Grants[staffID]) != 0 {
			t.Errorf("職員 = %+v, want 変わらない", d)
		}
	})
}
