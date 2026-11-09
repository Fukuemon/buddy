package organization_test

import (
	"context"
	"errors"
	"testing"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/inmem"
)

func TestOrganizationUpdateTeam(t *testing.T) {
	s := inmem.Seeded()
	guard := func(context.Context) error { return nil }
	createTeam := organization.NewCreateTeam(inmem.Facilities{Store: s}, inmem.Teams{Store: s}, &inmem.SeqIDs{}, guard)
	updateTeam := organization.NewUpdateTeam(inmem.Teams{Store: s}, guard)
	ctx := context.Background()
	a, err := createTeam.Do(ctx, facilityID, "A", "")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := createTeam.Do(ctx, facilityID, "B", ""); err != nil {
		t.Fatal(err)
	}
	got, err := updateTeam.Do(ctx, a.ID, "訪問", organization.TeamColorLime)
	if err != nil {
		t.Fatal(err)
	}
	if got.Name != "訪問" || got.Color != organization.TeamColorLime || got.FacilityID != facilityID {
		t.Errorf("UpdateTeam = %+v", got)
	}
	if _, err := updateTeam.Do(ctx, a.ID, "訪問", organization.TeamColorBlue); err != nil {
		t.Errorf("同じ名前のまま色だけ変える: err = %v", err)
	}
	if _, err := updateTeam.Do(ctx, a.ID, "B", organization.TeamColorBlue); !errors.Is(err, apperr.ErrConflict) {
		t.Errorf("ほかのチームと同じ名前: err = %v, want ErrConflict", err)
	}
	if _, err := updateTeam.Do(ctx, a.ID, "訪問", "red"); !errors.Is(err, apperr.ErrInvalidInput) {
		t.Errorf("8 色にない色: err = %v, want ErrInvalidInput", err)
	}
	if _, err := updateTeam.Do(ctx, "MISSING", "訪問", organization.TeamColorBlue); !errors.Is(err, apperr.ErrNotFound) {
		t.Errorf("無いチーム: err = %v, want ErrNotFound", err)
	}
}

// TestOrganizationUpdateTeamForbidden は、職員の管理を許されない職員が、チームの名前と色を変えられないことを確認する。
func TestOrganizationUpdateTeamForbidden(t *testing.T) {
	s := inmem.Seeded()
	s.Teams["TEAM"] = organization.Team{ID: "TEAM", FacilityID: facilityID, Name: "A", Color: organization.TeamColorBlue}
	guard := func(context.Context) error { return apperr.ErrForbidden }
	updateTeam := organization.NewUpdateTeam(inmem.Teams{Store: s}, guard)
	if _, err := updateTeam.Do(context.Background(), "TEAM", "B", organization.TeamColorLime); !errors.Is(err, apperr.ErrForbidden) {
		t.Fatalf("err = %v, want ErrForbidden", err)
	}
	if got := s.Teams["TEAM"]; got.Name != "A" || got.Color != organization.TeamColorBlue {
		t.Errorf("拒んだのにチームが変わった: %+v", got)
	}
}
