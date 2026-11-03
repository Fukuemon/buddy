package organization

import (
	"context"
)

// GetDepartment は、部署 id を返す。見つからないときは apperr.ErrNotFound を返す。
func (o *App) GetDepartment(ctx context.Context, id string) (Department, error) {
	return o.deps.Departments.Get(ctx, id)
}
