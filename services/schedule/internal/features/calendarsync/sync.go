package calendarsync

import (
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendar"
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
	Calendar calendar.ExternalCalendar
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
