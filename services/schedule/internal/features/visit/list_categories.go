package visit

import (
	"context"
)

// ListCategories は、すべての訪問の区分を返す。
func (v *App) ListCategories(ctx context.Context) ([]Category, error) {
	return v.masters.ListCategories(ctx)
}
