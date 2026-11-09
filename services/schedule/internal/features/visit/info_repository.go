package visit

import "context"

// InfoRepository は、訪問の情報を書く。
type InfoRepository interface {
	Create(ctx context.Context, i Info) error
	// DeleteIfUnused は、どの予定、繰り返しの予定、Google カレンダーに書いた予定の記録も指していない訪問の情報を消す。
	// 指されているか、無いときは何もしない。
	DeleteIfUnused(ctx context.Context, id string) error
}
