package visit

import (
	"context"
)

// ListCategories は、すべての訪問の区分を返す。
type ListCategories struct {
	masters MasterRepository
}

// NewListCategories は ListCategories を作る。
func NewListCategories(masters MasterRepository) ListCategories {
	return ListCategories{masters: masters}
}

// Do は、すべての訪問の区分を返す。
func (o ListCategories) Do(ctx context.Context) ([]Category, error) {
	return o.masters.ListCategories(ctx)
}
