package calendarsync

import (
	"context"
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
)

// SyncRepository は、カレンダーの同期の状態を読み書きする。
type SyncRepository interface {
	// Claim は、事業所の正本のモードが modes にあり、読む時刻を過ぎた外していないカレンダーを max 件まで取り、lease の間は
	// ほかの処理に渡さないようにして返す。同期の状態の行が無いカレンダーには、行を足してから取る。
	Claim(ctx context.Context, max int, lease time.Duration, modes []organization.SourceMode) ([]SyncState, error)
	// Finish は、s を同期した結果 r を書く。s を取った後にほかの処理が取り直していれば（lease が切れたとき）、何も書かない。
	Finish(ctx context.Context, s SyncState, r SyncResult) error
	// Backlog は、事業所の正本のモードが modes にある、外していないカレンダーの同期の滞留を返す。
	Backlog(ctx context.Context, modes []organization.SourceMode) (SyncBacklog, error)
}

// SyncBacklog は、カレンダーの同期の滞留である。
type SyncBacklog struct {
	// OverdueCount は、読む時刻を過ぎたカレンダーの数である。
	OverdueCount int
	// OldestSuccessAge は、最後の成功が最も古いカレンダーの、最後の成功からの時間である。1 回も成功していないカレンダーは、
	// 同期を始めた時刻から数える。カレンダーが無ければ 0 である。
	OldestSuccessAge time.Duration
}
