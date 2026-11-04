package organization

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
)

// UpdateDepartment は、部署 id の名前を変え、変えた部署を返す。
type UpdateDepartment struct {
	departments DepartmentRepository
	guard       Guard
}

// NewUpdateDepartment は UpdateDepartment を作る。
func NewUpdateDepartment(departments DepartmentRepository, guard Guard) UpdateDepartment {
	return UpdateDepartment{departments: departments, guard: guard}
}

// Do は、部署 id の名前を変え、変えた部署を返す。職員の管理の権限が無いときは apperr.ErrForbidden を、
// 名前が不正なときは入力のエラーを、同じ事業所にほかの同じ名前の部署があるときは apperr.ErrConflict を返す。
func (o UpdateDepartment) Do(ctx context.Context, id, name string) (Department, error) {
	if err := o.guard(ctx); err != nil {
		return Department{}, err
	}
	cur, err := o.departments.Get(ctx, id)
	if err != nil {
		return Department{}, err
	}
	d, err := NewDepartment(cur.ID, cur.FacilityID, name)
	if err != nil {
		return Department{}, err
	}
	if err := o.departments.Update(ctx, d); err != nil {
		return Department{}, apperr.AsConflict(err, "部署 %s はこの事業所にすでにあります", d.Name)
	}
	return o.departments.Get(ctx, d.ID)
}
