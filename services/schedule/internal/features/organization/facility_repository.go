package organization

import "context"

// FacilityRepository は、事業所を読む。見つからないときは apperr.ErrNotFound を返す。
// GetByOrgID は、ID ブローカーの組織の ID に結び付けた事業所を返す。
type FacilityRepository interface {
	Get(ctx context.Context, id string) (Facility, error)
	GetByOrgID(ctx context.Context, orgID string) (Facility, error)
}
