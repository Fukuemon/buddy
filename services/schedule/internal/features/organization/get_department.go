package organization

import (
	"context"
)

// GetDepartment は、部署 id を返す。
type GetDepartment struct {
	departments DepartmentRepository
}

// NewGetDepartment は GetDepartment を作る。
func NewGetDepartment(departments DepartmentRepository) GetDepartment {
	return GetDepartment{departments: departments}
}

// Do は、部署 id を返す。見つからないときは apperr.ErrNotFound を返す。
func (o GetDepartment) Do(ctx context.Context, id string) (Department, error) {
	return o.departments.Get(ctx, id)
}
