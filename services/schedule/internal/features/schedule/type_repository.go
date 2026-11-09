package schedule

import "context"

// TypeRepository は、予定の種類のマスタを読む。見つからないときは apperr.ErrNotFound を返す。
type TypeRepository interface {
	Get(ctx context.Context, id string) (Type, error)
	List(ctx context.Context) ([]Type, error)
}
