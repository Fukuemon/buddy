package organization

import (
	"context"
)

// ListPolicies は、全ての権限を返す。
type ListPolicies struct {
	policies PolicyRepository
}

// NewListPolicies は ListPolicies を作る。
func NewListPolicies(policies PolicyRepository) ListPolicies {
	return ListPolicies{policies: policies}
}

// Do は、全ての権限を返す。権限は事業所ごとに持たないので、事業所を受けない。
func (o ListPolicies) Do(ctx context.Context) ([]Policy, error) {
	return o.policies.List(ctx)
}
