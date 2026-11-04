package organization

import (
	"context"
)

// GetPolicy は、権限 id を返す。
type GetPolicy struct {
	policies PolicyRepository
}

// NewGetPolicy は GetPolicy を作る。
func NewGetPolicy(policies PolicyRepository) GetPolicy {
	return GetPolicy{policies: policies}
}

// Do は、権限 id を返す。見つからないときは apperr.ErrNotFound を返す。
func (o GetPolicy) Do(ctx context.Context, id string) (Policy, error) {
	return o.policies.Get(ctx, id)
}
