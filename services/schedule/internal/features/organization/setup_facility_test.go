package organization_test

import (
	"context"
	"errors"
	"slices"
	"testing"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/inmem"
)

// policyStore は、標準の役職の 9 つの権限のレコードを持つ Store を返す。権限の ID は code と同じにする。
func policyStore() *inmem.Store {
	s := inmem.NewStore()
	for _, c := range []organization.PolicyCode{
		organization.ScheduleSelfEdit, organization.ScheduleUserRead, organization.ScheduleUserEdit,
		organization.ScheduleTeamRead, organization.ScheduleTeamEdit, organization.ScheduleAllRead, organization.ScheduleAllEdit,
		organization.StaffManage, organization.ReceiptCheck,
	} {
		s.Policies[string(c)] = organization.Policy{ID: string(c), Code: c, Name: string(c), NeedsTarget: c.IsTeamTarget()}
	}
	return s
}

func newSetup(s *inmem.Store) organization.SetupFacility {
	f := inmem.Facilities{Store: s}
	return organization.NewSetupFacility(f, f, inmem.Departments{Store: s}, inmem.Teams{Store: s}, inmem.Positions{Store: s},
		inmem.Policies{Store: s}, &inmem.SeqIDs{})
}

var setupInput = organization.SetupFacilityInput{OrgID: "org-new", Name: "新しい事業所", DepartmentName: "看護部", TeamName: "A チーム"}

func codesOf(p organization.Position) []organization.PolicyCode {
	var out []organization.PolicyCode
	for _, pol := range p.Policies {
		out = append(out, pol.Code)
	}
	slices.Sort(out)
	return out
}

func TestSetupFacilityCreatesStandardPositions(t *testing.T) {
	s := policyStore()
	got, err := newSetup(s).Do(context.Background(), setupInput)
	if err != nil {
		t.Fatal(err)
	}
	if !got.FacilityCreated || !got.DepartmentCreated || !got.TeamCreated || got.Facility.SourceMode != organization.SourceGooglePrimary {
		t.Errorf("got %+v", got)
	}
	for i, sp := range organization.StandardPositions() {
		want := slices.Clone(sp.Policies)
		slices.Sort(want)
		if got.Positions[i].Name != sp.Name || !slices.Equal(codesOf(got.Positions[i]), want) {
			t.Errorf("役職 %d = %s %v, want %s %v", i, got.Positions[i].Name, codesOf(got.Positions[i]), sp.Name, want)
		}
	}
	if got.ManagerPosition.Name != "マネージャー" {
		t.Errorf("マネージャーの役職 = %s", got.ManagerPosition.Name)
	}
}

// 既にある事業所では役職を作らず、名前を変えた役職でも、職員の管理の権限をデフォルトに持つ役職をマネージャーの役職にする。
// 部署は同じ名前を使い、チームは無ければ、使われていない色で作る。
func TestSetupFacilityReusesExistingFacility(t *testing.T) {
	s := policyStore()
	ctx := context.Background()
	first, err := newSetup(s).Do(ctx, setupInput)
	if err != nil {
		t.Fatal(err)
	}
	mgr := s.Positions[first.ManagerPosition.ID]
	mgr.Name = "管理者"
	s.Positions[mgr.ID] = mgr
	in := setupInput
	in.TeamName = "B チーム"
	got, err := newSetup(s).Do(ctx, in)
	if err != nil {
		t.Fatal(err)
	}
	if got.FacilityCreated || len(got.CreatedPositions) != 0 || len(s.Positions) != 4 {
		t.Errorf("役職を作った: %+v, %d", got.CreatedPositions, len(s.Positions))
	}
	if got.ManagerPosition.ID != mgr.ID {
		t.Errorf("マネージャーの役職 = %s, want %s", got.ManagerPosition.Name, mgr.Name)
	}
	if got.DepartmentCreated || got.Department.ID != first.Department.ID {
		t.Errorf("部署 = %+v, want 既にある部署", got.Department)
	}
	if !got.TeamCreated || got.Team.Color == first.Team.Color {
		t.Errorf("チーム = %+v, want 色が %s と違う新しいチーム", got.Team, first.Team.Color)
	}
}

func TestSetupFacilityErrors(t *testing.T) {
	tests := []struct {
		name  string
		prep  func(*inmem.Store)
		input func(organization.SetupFacilityInput) organization.SetupFacilityInput
		want  error
	}{
		{"組織の ID が空", nil, func(in organization.SetupFacilityInput) organization.SetupFacilityInput { in.OrgID = " "; return in }, apperr.ErrInvalidInput},
		{"事業所の名前が空", nil, func(in organization.SetupFacilityInput) organization.SetupFacilityInput { in.Name = ""; return in }, apperr.ErrInvalidInput},
		{"部署の名前が空", nil, func(in organization.SetupFacilityInput) organization.SetupFacilityInput {
			in.DepartmentName = ""
			return in
		}, apperr.ErrInvalidInput},
		{"同じ組織の事業所が別の名前", func(s *inmem.Store) {
			s.Facilities["FAC"] = organization.Facility{ID: "FAC", Name: "別の名前", OrgID: "org-new"}
			s.FacilityByOrg["org-new"] = "FAC"
		}, nil, apperr.ErrConflict},
		{"既にある事業所に職員の管理の権限を持つ役職が無い", func(s *inmem.Store) {
			s.Facilities["FAC"] = organization.Facility{ID: "FAC", Name: setupInput.Name, OrgID: "org-new"}
			s.FacilityByOrg["org-new"] = "FAC"
			s.Positions["POS"] = organization.Position{ID: "POS", FacilityID: "FAC", Name: "メンバー"}
		}, nil, apperr.ErrConflict},
		{"権限のレコードが無い", func(s *inmem.Store) { delete(s.Policies, string(organization.ReceiptCheck)) }, nil, nil},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := policyStore()
			if tt.prep != nil {
				tt.prep(s)
			}
			in := setupInput
			if tt.input != nil {
				in = tt.input(in)
			}
			_, err := newSetup(s).Do(context.Background(), in)
			if err == nil || (tt.want != nil && !errors.Is(err, tt.want)) {
				t.Errorf("err = %v, want %v", err, tt.want)
			}
		})
	}
}
