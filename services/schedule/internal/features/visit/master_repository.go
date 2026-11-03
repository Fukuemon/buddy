package visit

import "context"

// MasterRepository は、サービスコードと訪問の区分のマスタを読む。GetServiceCode は、見つからないときに apperr.ErrNotFound を返す。
// ListCategoriesByIDs は、見つかったものだけを返す。
type MasterRepository interface {
	GetServiceCode(ctx context.Context, id string) (ServiceCode, error)
	ListServiceCodes(ctx context.Context) ([]ServiceCode, error)
	ListCategories(ctx context.Context) ([]Category, error)
	ListCategoriesByIDs(ctx context.Context, ids []string) ([]Category, error)
}
