package organization

import "context"

// TeamRepository は、チームを読み書きする。見つからないときは apperr.ErrNotFound を、
// 同じ事業所に同じ名前があるときは apperr.ErrConflict を返す。Update は、チーム t.ID の名前と色を t の値にする。
type TeamRepository interface {
	Get(ctx context.Context, id string) (Team, error)
	ListByFacility(ctx context.Context, facilityID string) ([]Team, error)
	Create(ctx context.Context, t Team) error
	Update(ctx context.Context, t Team) error
}
