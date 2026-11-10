package organization

import "context"

// FacilityRepository は、事業所を読む。見つからないときは apperr.ErrNotFound を返す。
// GetByOrgID は、ID ブローカーの組織の ID に結び付けた事業所を返す。
type FacilityRepository interface {
	Get(ctx context.Context, id string) (Facility, error)
	GetByOrgID(ctx context.Context, orgID string) (Facility, error)
}

// FacilityCreator は、事業所を書く。同じ組織の ID の事業所があるときは apperr.ErrConflict を返す。運営用の CLI の SetupFacility だけが使い、
// 事業所を読む操作に書くメソッドを渡さないよう、FacilityRepository と分ける。
type FacilityCreator interface {
	Create(ctx context.Context, f Facility) error
}
