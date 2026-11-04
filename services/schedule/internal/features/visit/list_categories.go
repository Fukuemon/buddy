package visit

import (
	"context"
)

// ListCategories は、すべての訪問の区分を返す。
type ListCategories struct {
	categories CategoryRepository
}

// NewListCategories は ListCategories を作る。
func NewListCategories(categories CategoryRepository) ListCategories {
	return ListCategories{categories: categories}
}

// Do は、すべての訪問の区分を返す。
func (o ListCategories) Do(ctx context.Context) ([]Category, error) {
	return o.categories.List(ctx)
}
