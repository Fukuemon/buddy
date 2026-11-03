package organization

import "context"

// PolicyRepository は、権限を読む。見つからないときは apperr.ErrNotFound を返す。ListByIDs は、見つかったものだけを返す。
type PolicyRepository interface {
	Get(ctx context.Context, id string) (Policy, error)
	List(ctx context.Context) ([]Policy, error)
	ListByIDs(ctx context.Context, ids []string) ([]Policy, error)
}
