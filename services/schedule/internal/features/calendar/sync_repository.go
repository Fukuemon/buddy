package calendar

import (
	"context"
	"time"
)

// SyncRepository は、カレンダーの同期の状態を読み書きする。
type SyncRepository interface {
	// Claim は、読む時刻を過ぎた外していないカレンダーを max 件まで取り、lease の間はほかの処理に渡さないようにして返す。
	// 同期の状態の行が無いカレンダーには、行を足してから取る。
	Claim(ctx context.Context, max int, lease time.Duration) ([]SyncState, error)
	// Finish は、s を同期した結果 r を書く。s を取った後にほかの処理が取り直していれば（lease が切れたとき）、何も書かない。
	Finish(ctx context.Context, s SyncState, r SyncResult) error
}
