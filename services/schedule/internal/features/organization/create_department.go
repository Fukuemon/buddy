package organization

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/kernel"
)

// CreateDepartment は、事業所に部署を作り、保存した部署を返す。
type CreateDepartment struct {
	facilities  FacilityRepository
	departments DepartmentRepository
	ids         kernel.IDGenerator
	guard       kernel.Guard
}

// NewCreateDepartment は CreateDepartment を作る。
func NewCreateDepartment(facilities FacilityRepository, departments DepartmentRepository, ids kernel.IDGenerator, guard kernel.Guard) CreateDepartment {
	return CreateDepartment{facilities: facilities, departments: departments, ids: ids, guard: guard}
}

// Do は、事業所に部署を作り、保存した部署を返す。職員の管理の権限が無いときは apperr.ErrForbidden を、
// 名前が不正なときは入力のエラーを、同じ事業所に同じ名前の部署があるときは apperr.ErrConflict を返す。
func (o CreateDepartment) Do(ctx context.Context, facilityID, name string) (Department, error) {
	if err := o.guard(ctx); err != nil {
		return Department{}, err
	}
	if _, err := o.facilities.Get(ctx, facilityID); err != nil {
		return Department{}, err
	}
	d, err := NewDepartment(o.ids.NewID(), facilityID, name)
	if err != nil {
		return Department{}, err
	}
	if err := o.departments.Create(ctx, d); err != nil {
		return Department{}, apperr.AsConflict(err, "部署 %s はこの事業所にすでにあります", d.Name)
	}
	return o.departments.Get(ctx, d.ID)
}
