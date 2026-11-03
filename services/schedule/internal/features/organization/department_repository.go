package organization

import "context"

// DepartmentRepository は、部署を読み書きする。見つからないときは apperr.ErrNotFound を、
// 同じ事業所に同じ名前があるときは apperr.ErrConflict を返す。Update は、部署 d.ID の名前を d の値にする。
type DepartmentRepository interface {
	Get(ctx context.Context, id string) (Department, error)
	ListByFacility(ctx context.Context, facilityID string) ([]Department, error)
	Create(ctx context.Context, d Department) error
	Update(ctx context.Context, d Department) error
}
