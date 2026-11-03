package organization_test

import (
	"context"
	"errors"
	"testing"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/inmem"
)

func TestOrganizationCreateDepartment(t *testing.T) {
	s := inmem.Seeded()
	uc := organization.NewApp(organization.Deps{
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
