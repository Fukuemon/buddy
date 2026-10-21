package organization_test

import (
	"context"
	"errors"
	"testing"

	"github.com/Fukuemon/buddy/apps/schedule-api/internal/apperr"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/inmem"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/organization"
)

const (
	facilityID = inmem.FacilityID
)

func TestOrganizationCreatePosition(t *testing.T) {
	s := inmem.Seeded()
	s.Policies["P1"] = organization.Policy{ID: "P1"}
	uc := organization.NewUsecase(organization.Repositories{
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
	uc := organization.NewUsecase(organization.Repositories{
		Facilities: inmem.Facilities{Store: s}, Teams: inmem.Teams{Store: s},
	}, &inmem.Tx{}, &inmem.SeqIDs{}, func(context.Context) error { return nil })
	ctx := context.Background()
	if _, err := uc.CreateTeam(ctx, facilityID, "訪問"); err != nil {
		t.Fatal(err)
	}
	if _, err := uc.CreateTeam(ctx, facilityID, "訪問"); !errors.Is(err, apperr.ErrConflict) ||
		err.Error() != "チーム 訪問 はこの事業所にすでにあります" {
		t.Errorf("同じ名前: err = %v, want 名前の重なりの ErrConflict", err)
	}
}

// TestOrganizationCreatePositionForbidden は、職員の管理を許されない職員が役職を作れないことを確かめる。
// 役職の既定に職員の管理の権限を入れて、ほかの職員に配れないようにするためである（ADR-0006）。
func TestOrganizationCreatePositionForbidden(t *testing.T) {
	s := inmem.Seeded()
	uc := organization.NewUsecase(organization.Repositories{
		Facilities: inmem.Facilities{Store: s}, Positions: inmem.Positions{Store: s}, Policies: inmem.Policies{Store: s},
	}, &inmem.Tx{}, &inmem.SeqIDs{}, func(context.Context) error { return apperr.ErrForbidden })
	if _, err := uc.CreatePosition(context.Background(), facilityID, "主任", nil); !errors.Is(err, apperr.ErrForbidden) {
		t.Fatalf("err = %v, want ErrForbidden", err)
	}
	if len(s.Positions) != 0 {
		t.Errorf("拒んだのに役職が増えた: %d", len(s.Positions))
	}
}
