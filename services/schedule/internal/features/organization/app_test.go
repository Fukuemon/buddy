package organization_test

import (
	"context"
	"errors"
	"testing"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/inmem"
)

const (
	facilityID = inmem.FacilityID
)

// TestOrganizationDepartmentForbidden は、職員の管理を許されない職員が、部署を作れず、名前を変えられないことを確認する。
func TestOrganizationDepartmentForbidden(t *testing.T) {
	s := inmem.Seeded()
	s.Departments["DEP"] = organization.Department{ID: "DEP", FacilityID: facilityID, Name: "A"}
	before := len(s.Departments)
	guard := func(context.Context) error { return apperr.ErrForbidden }
	createDepartment := organization.NewCreateDepartment(inmem.Facilities{Store: s}, inmem.Departments{Store: s}, &inmem.SeqIDs{}, guard)
	updateDepartment := organization.NewUpdateDepartment(inmem.Departments{Store: s}, guard)
	ctx := context.Background()
	if _, err := createDepartment.Do(ctx, facilityID, "看護部"); !errors.Is(err, apperr.ErrForbidden) {
		t.Errorf("作成: err = %v, want ErrForbidden", err)
	}
	if _, err := updateDepartment.Do(ctx, "DEP", "B"); !errors.Is(err, apperr.ErrForbidden) {
		t.Errorf("名前の変更: err = %v, want ErrForbidden", err)
	}
	if len(s.Departments) != before || s.Departments["DEP"].Name != "A" {
		t.Errorf("拒んだのに部署が変わった: %+v", s.Departments)
	}
}
