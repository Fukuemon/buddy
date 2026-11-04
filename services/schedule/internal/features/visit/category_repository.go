package visit

import "context"

// CategoryRepository は、訪問の区分のマスタを読む。ListByIDs は、見つかったものだけを返す。
type CategoryRepository interface {
	List(ctx context.Context) ([]Category, error)
	ListByIDs(ctx context.Context, ids []string) ([]Category, error)
}
