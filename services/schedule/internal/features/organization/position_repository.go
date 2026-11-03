package organization

import "context"

// PositionRepository は、役職とデフォルトの権限を読み書きする。見つからないときは apperr.ErrNotFound を、
// 同じ事業所に同じ名前があるときは apperr.ErrConflict を返す。
type PositionRepository interface {
	Get(ctx context.Context, id string) (Position, error)
	ListByFacility(ctx context.Context, facilityID string) ([]Position, error)
	Create(ctx context.Context, p Position) error
}
