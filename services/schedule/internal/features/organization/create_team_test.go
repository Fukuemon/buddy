package organization_test

import (
	"context"
	"errors"
	"testing"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/inmem"
)

func TestOrganizationCreateTeam(t *testing.T) {
	s := inmem.Seeded()
	guard := func(context.Context) error { return nil }
	createTeam := organization.NewCreateTeam(inmem.Facilities{Store: s}, inmem.Teams{Store: s}, &inmem.SeqIDs{}, guard)
	ctx := context.Background()
	got, err := createTeam.Do(ctx, facilityID, "訪問", organization.TeamColorCyan)
	if err != nil {
		t.Fatal(err)
	}
	if got.Color != organization.TeamColorCyan {
		t.Errorf("色を指定: Color = %s, want cyan", got.Color)
	}
	if _, err := createTeam.Do(ctx, facilityID, "訪問", ""); !errors.Is(err, apperr.ErrConflict) ||
		err.Error() != "チーム 訪問 はこの事業所にすでにあります" {
		t.Errorf("同じ名前: err = %v, want 名前の重なりの ErrConflict", err)
	}
	if _, err := createTeam.Do(ctx, facilityID, "外来", "red"); !errors.Is(err, apperr.ErrInvalidInput) {
		t.Errorf("8 色にない色: err = %v, want ErrInvalidInput", err)
	}
}

// TestOrganizationCreateTeamDefaultColor は、色を省いたチームに、事業所でまだ使っていない色が先頭から入ることを確認する。
// ほかの事業所のチームの色は数えない。
func TestOrganizationCreateTeamDefaultColor(t *testing.T) {
	s := inmem.Seeded()
	s.Teams["OTHER"] = organization.Team{ID: "OTHER", FacilityID: "OTHERFACILITY", Name: "B", Color: organization.TeamColorOrange}
	guard := func(context.Context) error { return nil }
	createTeam := organization.NewCreateTeam(inmem.Facilities{Store: s}, inmem.Teams{Store: s}, &inmem.SeqIDs{}, guard)
	ctx := context.Background()
	if _, err := createTeam.Do(ctx, facilityID, "A", organization.TeamColorBlue); err != nil {
		t.Fatal(err)
	}
	got, err := createTeam.Do(ctx, facilityID, "B", "")
	if err != nil {
		t.Fatal(err)
	}
	if got.Color != organization.TeamColorOrange {
		t.Errorf("Color = %s, want orange（blue の次の使っていない色）", got.Color)
	}
}

// TestOrganizationCreateTeamForbidden は、職員の管理を許されない職員がチームを作れないことを確認する。
func TestOrganizationCreateTeamForbidden(t *testing.T) {
	s := inmem.Seeded()
	before := len(s.Teams)
	guard := func(context.Context) error { return apperr.ErrForbidden }
	createTeam := organization.NewCreateTeam(inmem.Facilities{Store: s}, inmem.Teams{Store: s}, &inmem.SeqIDs{}, guard)
	if _, err := createTeam.Do(context.Background(), facilityID, "訪問", ""); !errors.Is(err, apperr.ErrForbidden) {
		t.Fatalf("err = %v, want ErrForbidden", err)
	}
	if len(s.Teams) != before {
		t.Errorf("拒んだのにチームが増えた: %d", len(s.Teams))
	}
}
