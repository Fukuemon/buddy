package organization

import (
	"context"
	"time"
)

// Facility は、訪問看護の事業所である。
type Facility struct {
	ID   string
	Name string
	// OrgID は、ID ブローカーの組織の ID で、結び付けるまで空である。
	OrgID     string
	CreatedAt time.Time
	UpdatedAt time.Time
}

// FacilityRepository は、事業所を読む。見つからないときは apperr.ErrNotFound を返す。
// GetByOrgID は、ID ブローカーの組織の ID に結び付けた事業所を返す。
type FacilityRepository interface {
	Get(ctx context.Context, id string) (Facility, error)
	GetByOrgID(ctx context.Context, orgID string) (Facility, error)
}
