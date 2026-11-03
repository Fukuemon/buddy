package calendar

import (
	"context"
	"time"
)

// SyncStatus は、カレンダーの最後の同期の結果である。
type SyncStatus string

// SyncStatus の値。
const (
	SyncNever     SyncStatus = "never"
	SyncSucceeded SyncStatus = "succeeded"
	SyncFailed    SyncStatus = "failed"
)

// SyncErrorCode は、同期できなかった理由である。カレンダーの ID と予定のタイトルを含めないよう、決まった値だけを持つ。
type SyncErrorCode string

// SyncErrorCode の値。
const (
	// SyncUnreadable は、カレンダーが無いか、サービスアカウントに共有されていないことを表す。
	SyncUnreadable SyncErrorCode = "unreadable"
	// SyncUnavailable は、外部のカレンダーに届かないか、外部のカレンダーがエラーを返したことを表す。
	SyncUnavailable SyncErrorCode = "unavailable"
	// SyncApplyFailed は、読んだ予定を buddy に当てられず、トークンを進めなかったことを表す。
	SyncApplyFailed SyncErrorCode = "apply"
)

// SyncState は、同期の処理が取った 1 つのカレンダーと、その同期の状態である。
type SyncState struct {
	Calendar ExternalCalendar
	// SyncToken は、次の増分の取得に使うトークンで、全ての予定を読むときは空である。
	SyncToken  string
	LastStatus SyncStatus
	LastError  *SyncErrorCode
	// LockedUntil は、取ったときに決めた期限である。結果を書くときに、ほかの処理が取り直していないかを比べる。
	LockedUntil time.Time
}

// SyncResult は、1 つのカレンダーを同期した結果である。After の後に、もう一度読む。
type SyncResult struct {
	SyncToken string
	Status    SyncStatus
	ErrorCode *SyncErrorCode
	After     time.Duration
}

// SyncRepository は、カレンダーの同期の状態を読み書きする。
type SyncRepository interface {
	// Claim は、読む時刻を過ぎた外していないカレンダーを max 件まで取り、lease の間はほかの処理に渡さないようにして返す。
	// 同期の状態の行が無いカレンダーには、行を足してから取る。
	Claim(ctx context.Context, max int, lease time.Duration) ([]SyncState, error)
	// Finish は、s を同期した結果 r を書く。s を取った後にほかの処理が取り直していれば（lease が切れたとき）、何も書かない。
	Finish(ctx context.Context, s SyncState, r SyncResult) error
}
