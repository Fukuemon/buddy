package organization

import (
	"context"
)

// ListPolicies は、全ての権限を返す。権限は事業所ごとに持たないので、事業所を受けない。
func (o *Usecase) ListPolicies(ctx context.Context) ([]Policy, error) {
	return o.deps.Policies.List(ctx)
}
