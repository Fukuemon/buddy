package organization_test

import (
	"context"
	"errors"
	"testing"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/inmem"
	"github.com/Fukuemon/buddy/services/schedule/internal/organization"
)

const (
	facilityID = inmem.FacilityID
)

func TestOrganizationCreatePosition(t *testing.T) {
	s := inmem.Seeded()
	s.Policies["P1"] = organization.Policy{ID: "P1"}
	uc := organization.NewUsecase(organization.Deps{
		Facilities: inmem.Facilities{Store: s}, Positions: inmem.Positions{Store: s}, Policies: inmem.Policies{Store: s},
	}, &inmem.Tx{}, &inmem.SeqIDs{}, func(context.Context) error { return nil })
	ctx := context.Background()
	if _, err := uc.CreatePosition(ctx, facilityID, "リーダー", []string{"P1", "MISSING"}); !errors.Is(err, apperr.ErrInvalidInput) {
		t.Fatalf("err = %v, want ErrInvalidInput", err)
	}
	got, err := uc.CreatePosition(ctx, facilityID, "リーダー", []string{"P1"})
	if err != nil {
		t.Fatal(err)
	}
	if len(got.Policies) != 1 {
		t.Errorf("Policies = %+v", got.Policies)
	}
	if _, err := uc.CreatePosition(ctx, facilityID, "リーダー", nil); !errors.Is(err, apperr.ErrConflict) ||
		err.Error() != "役職 リーダー はこの事業所にすでにあります" {
		t.Errorf("同じ名前: err = %v, want 名前の重なりの ErrConflict", err)
	}
}

func TestOrganizationCreateTeam(t *testing.T) {
	s := inmem.Seeded()
	uc := organization.NewUsecase(organization.Deps{
		Facilities: inmem.Facilities{Store: s}, Teams: inmem.Teams{Store: s},
	}, &inmem.Tx{}, &inmem.SeqIDs{}, func(context.Context) error { return nil })
	ctx := context.Background()
	got, err := uc.CreateTeam(ctx, facilityID, "訪問", organization.TeamColorCyan)
	if err != nil {
		t.Fatal(err)
	}
	if got.Color != organization.TeamColorCyan {
		t.Errorf("色を指定: Color = %s, want cyan", got.Color)
	}
	if _, err := uc.CreateTeam(ctx, facilityID, "訪問", ""); !errors.Is(err, apperr.ErrConflict) ||
		err.Error() != "チーム 訪問 はこの事業所にすでにあります" {
		t.Errorf("同じ名前: err = %v, want 名前の重なりの ErrConflict", err)
	}
	if _, err := uc.CreateTeam(ctx, facilityID, "外来", "red"); !errors.Is(err, apperr.ErrInvalidInput) {
		t.Errorf("8 色にない色: err = %v, want ErrInvalidInput", err)
	}
}

// TestOrganizationCreateTeamDefaultColor は、色を省いたチームに、事業所でまだ使っていない色が先頭から入ることを確認する。
// ほかの事業所のチームの色は数えない。
func TestOrganizationCreateTeamDefaultColor(t *testing.T) {
	s := inmem.Seeded()
	s.Teams["OTHER"] = organization.Team{ID: "OTHER", FacilityID: "OTHERFACILITY", Name: "B", Color: organization.TeamColorOrange}
	uc := organization.NewUsecase(organization.Deps{
		Facilities: inmem.Facilities{Store: s}, Teams: inmem.Teams{Store: s},
	}, &inmem.Tx{}, &inmem.SeqIDs{}, func(context.Context) error { return nil })
	ctx := context.Background()
	if _, err := uc.CreateTeam(ctx, facilityID, "A", organization.TeamColorBlue); err != nil {
		t.Fatal(err)
	}
	got, err := uc.CreateTeam(ctx, facilityID, "B", "")
	if err != nil {
		t.Fatal(err)
	}
	if got.Color != organization.TeamColorOrange {
		t.Errorf("Color = %s, want orange（blue の次の使っていない色）", got.Color)
	}
}

func TestOrganizationUpdateTeam(t *testing.T) {
	s := inmem.Seeded()
	uc := organization.NewUsecase(organization.Deps{
		Facilities: inmem.Facilities{Store: s}, Teams: inmem.Teams{Store: s},
	}, &inmem.Tx{}, &inmem.SeqIDs{}, func(context.Context) error { return nil })
	ctx := context.Background()
	a, err := uc.CreateTeam(ctx, facilityID, "A", "")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := uc.CreateTeam(ctx, facilityID, "B", ""); err != nil {
		t.Fatal(err)
	}
	got, err := uc.UpdateTeam(ctx, a.ID, "訪問", organization.TeamColorLime)
	if err != nil {
		t.Fatal(err)
	}
	if got.Name != "訪問" || got.Color != organization.TeamColorLime || got.FacilityID != facilityID {
		t.Errorf("UpdateTeam = %+v", got)
	}
	if _, err := uc.UpdateTeam(ctx, a.ID, "訪問", organization.TeamColorBlue); err != nil {
		t.Errorf("同じ名前のまま色だけ変える: err = %v", err)
	}
	if _, err := uc.UpdateTeam(ctx, a.ID, "B", organization.TeamColorBlue); !errors.Is(err, apperr.ErrConflict) {
		t.Errorf("ほかのチームと同じ名前: err = %v, want ErrConflict", err)
	}
	if _, err := uc.UpdateTeam(ctx, a.ID, "訪問", "red"); !errors.Is(err, apperr.ErrInvalidInput) {
		t.Errorf("8 色にない色: err = %v, want ErrInvalidInput", err)
	}
	if _, err := uc.UpdateTeam(ctx, "MISSING", "訪問", organization.TeamColorBlue); !errors.Is(err, apperr.ErrNotFound) {
		t.Errorf("無いチーム: err = %v, want ErrNotFound", err)
	}
}

// TestOrganizationUpdateTeamForbidden は、職員の管理を許されない職員が、チームの名前と色を変えられないことを確認する。
func TestOrganizationUpdateTeamForbidden(t *testing.T) {
	s := inmem.Seeded()
	s.Teams["TEAM"] = organization.Team{ID: "TEAM", FacilityID: facilityID, Name: "A", Color: organization.TeamColorBlue}
	uc := organization.NewUsecase(organization.Deps{
		Facilities: inmem.Facilities{Store: s}, Teams: inmem.Teams{Store: s},
	}, &inmem.Tx{}, &inmem.SeqIDs{}, func(context.Context) error { return apperr.ErrForbidden })
	if _, err := uc.UpdateTeam(context.Background(), "TEAM", "B", organization.TeamColorLime); !errors.Is(err, apperr.ErrForbidden) {
		t.Fatalf("err = %v, want ErrForbidden", err)
	}
	if got := s.Teams["TEAM"]; got.Name != "A" || got.Color != organization.TeamColorBlue {
		t.Errorf("拒んだのにチームが変わった: %+v", got)
	}
}

// TestOrganizationCreateTeamForbidden は、職員の管理を許されない職員がチームを作れないことを確認する。
func TestOrganizationCreateTeamForbidden(t *testing.T) {
	s := inmem.Seeded()
	before := len(s.Teams)
	uc := organization.NewUsecase(organization.Deps{
		Facilities: inmem.Facilities{Store: s}, Teams: inmem.Teams{Store: s},
	}, &inmem.Tx{}, &inmem.SeqIDs{}, func(context.Context) error { return apperr.ErrForbidden })
	if _, err := uc.CreateTeam(context.Background(), facilityID, "訪問", ""); !errors.Is(err, apperr.ErrForbidden) {
		t.Fatalf("err = %v, want ErrForbidden", err)
	}
	if len(s.Teams) != before {
		t.Errorf("拒んだのにチームが増えた: %d", len(s.Teams))
	}
}

// TestOrganizationCreatePositionForbidden は、職員の管理を許されない職員が役職を作れないことを確認する。
// 役職のデフォルトの権限に職員の管理の権限を入れて、ほかの職員に配れないようにするためである（ADR-0006）。
func TestOrganizationCreatePositionForbidden(t *testing.T) {
	s := inmem.Seeded()
	uc := organization.NewUsecase(organization.Deps{
		Facilities: inmem.Facilities{Store: s}, Positions: inmem.Positions{Store: s}, Policies: inmem.Policies{Store: s},
	}, &inmem.Tx{}, &inmem.SeqIDs{}, func(context.Context) error { return apperr.ErrForbidden })
	if _, err := uc.CreatePosition(context.Background(), facilityID, "主任", nil); !errors.Is(err, apperr.ErrForbidden) {
		t.Fatalf("err = %v, want ErrForbidden", err)
	}
	if len(s.Positions) != 0 {
		t.Errorf("拒んだのに役職が増えた: %d", len(s.Positions))
	}
}

func TestOrganizationCreateDepartment(t *testing.T) {
	s := inmem.Seeded()
	uc := organization.NewUsecase(organization.Deps{
		Facilities: inmem.Facilities{Store: s}, Departments: inmem.Departments{Store: s},
	}, &inmem.Tx{}, &inmem.SeqIDs{}, func(context.Context) error { return nil })
	ctx := context.Background()
	got, err := uc.CreateDepartment(ctx, facilityID, "看護部")
	if err != nil {
		t.Fatal(err)
	}
	if got.Name != "看護部" || got.FacilityID != facilityID {
		t.Errorf("CreateDepartment = %+v", got)
	}
	if _, err := uc.CreateDepartment(ctx, facilityID, "看護部"); !errors.Is(err, apperr.ErrConflict) ||
		err.Error() != "部署 看護部 はこの事業所にすでにあります" {
		t.Errorf("同じ名前: err = %v, want 名前の重なりの ErrConflict", err)
	}
	if _, err := uc.CreateDepartment(ctx, facilityID, ""); !errors.Is(err, apperr.ErrInvalidInput) {
		t.Errorf("空の名前: err = %v, want ErrInvalidInput", err)
	}
	if _, err := uc.CreateDepartment(ctx, "MISSING", "外来"); !errors.Is(err, apperr.ErrNotFound) {
		t.Errorf("無い事業所: err = %v, want ErrNotFound", err)
	}
}

func TestOrganizationUpdateDepartment(t *testing.T) {
	s := inmem.Seeded()
	uc := organization.NewUsecase(organization.Deps{
		Facilities: inmem.Facilities{Store: s}, Departments: inmem.Departments{Store: s},
	}, &inmem.Tx{}, &inmem.SeqIDs{}, func(context.Context) error { return nil })
	ctx := context.Background()
	a, err := uc.CreateDepartment(ctx, facilityID, "A")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := uc.CreateDepartment(ctx, facilityID, "B"); err != nil {
		t.Fatal(err)
	}
	got, err := uc.UpdateDepartment(ctx, a.ID, "看護部")
	if err != nil {
		t.Fatal(err)
	}
	if got.Name != "看護部" || got.FacilityID != facilityID {
		t.Errorf("UpdateDepartment = %+v", got)
	}
	if _, err := uc.UpdateDepartment(ctx, a.ID, "看護部"); err != nil {
		t.Errorf("同じ名前のまま保存する: err = %v", err)
	}
	if _, err := uc.UpdateDepartment(ctx, a.ID, "B"); !errors.Is(err, apperr.ErrConflict) {
		t.Errorf("ほかの部署と同じ名前: err = %v, want ErrConflict", err)
	}
	if _, err := uc.UpdateDepartment(ctx, a.ID, ""); !errors.Is(err, apperr.ErrInvalidInput) {
		t.Errorf("空の名前: err = %v, want ErrInvalidInput", err)
	}
	if _, err := uc.UpdateDepartment(ctx, "MISSING", "外来"); !errors.Is(err, apperr.ErrNotFound) {
		t.Errorf("無い部署: err = %v, want ErrNotFound", err)
	}
}

// TestOrganizationDepartmentForbidden は、職員の管理を許されない職員が、部署を作れず、名前を変えられないことを確認する。
func TestOrganizationDepartmentForbidden(t *testing.T) {
	s := inmem.Seeded()
	s.Departments["DEP"] = organization.Department{ID: "DEP", FacilityID: facilityID, Name: "A"}
	before := len(s.Departments)
	uc := organization.NewUsecase(organization.Deps{
		Facilities: inmem.Facilities{Store: s}, Departments: inmem.Departments{Store: s},
	}, &inmem.Tx{}, &inmem.SeqIDs{}, func(context.Context) error { return apperr.ErrForbidden })
	ctx := context.Background()
	if _, err := uc.CreateDepartment(ctx, facilityID, "看護部"); !errors.Is(err, apperr.ErrForbidden) {
		t.Errorf("作成: err = %v, want ErrForbidden", err)
	}
	if _, err := uc.UpdateDepartment(ctx, "DEP", "B"); !errors.Is(err, apperr.ErrForbidden) {
		t.Errorf("名前の変更: err = %v, want ErrForbidden", err)
	}
	if len(s.Departments) != before || s.Departments["DEP"].Name != "A" {
		t.Errorf("拒んだのに部署が変わった: %+v", s.Departments)
	}
}
