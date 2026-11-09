package servicecode

import "context"

// Repository は、サービスコードのマスタを読む。Get は、見つからないときに apperr.ErrNotFound を返す。
type Repository interface {
	Get(ctx context.Context, id string) (ServiceCode, error)
	List(ctx context.Context) ([]ServiceCode, error)
}
