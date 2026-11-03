package organization_test

import (
	"context"
	"errors"
	"testing"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/inmem"
)

func TestOrganizationUpdateDepartment(t *testing.T) {
	s := inmem.Seeded()
	uc := organization.NewApp(organization.Deps{
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
