package organization

import (
	"context"
)

// ListDepartments は、事業所 facilityID の全ての部署を返す。事業所が見つからないときは apperr.ErrNotFound を返す。
func (o *App) ListDepartments(ctx context.Context, facilityID string) ([]Department, error) {
	if _, err := o.deps.Facilities.Get(ctx, facilityID); err != nil {
		return nil, err
	}
	return o.deps.Departments.ListByFacility(ctx, facilityID)
}
