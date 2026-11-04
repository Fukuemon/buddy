package organization

import (
	"context"
)

// ListDepartments は、事業所 facilityID の全ての部署を返す。
type ListDepartments struct {
	facilities  FacilityRepository
	departments DepartmentRepository
}

// NewListDepartments は ListDepartments を作る。
func NewListDepartments(facilities FacilityRepository, departments DepartmentRepository) ListDepartments {
	return ListDepartments{facilities: facilities, departments: departments}
}

// Do は、事業所 facilityID の全ての部署を返す。事業所が見つからないときは apperr.ErrNotFound を返す。
func (o ListDepartments) Do(ctx context.Context, facilityID string) ([]Department, error) {
	if _, err := o.facilities.Get(ctx, facilityID); err != nil {
		return nil, err
	}
	return o.departments.ListByFacility(ctx, facilityID)
}
