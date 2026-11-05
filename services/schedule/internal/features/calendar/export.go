package calendar

import (
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
)

// ExportStatus は、書き出しの待ちの状態である。
type ExportStatus string

// ExportStatus の値。
const (
	// ExportPending の待ちは、NextAttemptAt の後に書く。
	ExportPending ExportStatus = "pending"
	// ExportSucceeded の待ちは、外部のカレンダーに書き終えた。
	ExportSucceeded ExportStatus = "succeeded"
	// ExportConflict の待ちは、外部のカレンダーで予定が変わっていたか消えていたので、書かずに止めた。
	ExportConflict ExportStatus = "conflict"
	// ExportFailed の待ちは、権限が無いか、再送の上限まで書けなかった。
	ExportFailed ExportStatus = "failed"
)

// ExportErrorCode は、書けなかった理由である。外部の予定のタイトルとカレンダーの ID を含めないよう、決まった値だけを持つ。
type ExportErrorCode string

// ExportErrorCode の値。
const (
	// ErrorPreconditionFailed は、最後に同期した後に外部のカレンダーで予定が変わったこと（412）を表す。
	ErrorPreconditionFailed ExportErrorCode = "precondition_failed"
	// ErrorNotFound は、外部のカレンダーで予定が消されたか、予定かカレンダーが見つからないことを表す。
	ErrorNotFound ExportErrorCode = "not_found"
	// ErrorRejected は、外部のカレンダーが予定の内容を受け付けなかったことを表す。
	ErrorRejected ExportErrorCode = "rejected"
	// ErrorForbidden は、サービスアカウントがカレンダーに予定を書けないことを表す。
	ErrorForbidden ExportErrorCode = "forbidden"
	// ErrorUnavailable は、外部のカレンダーに届かないか、外部のカレンダーが一時的なエラーを返したことを表す。
	ErrorUnavailable ExportErrorCode = "unavailable"
	// ErrorUnappliable は、外部のカレンダーでの予定の変更を、buddy の予定に読み替えられなかったことを表す。
	// 終日にした予定、タイトルの利用者を引けない予定、繰り返しの予定そのものの変更が当たる。
	ErrorUnappliable ExportErrorCode = "unappliable"
	// ErrorNotBuddyPrimary は、事業所が buddy を予定の正本にしていない（buddy_primary でない）ので、書かずに保留にしたことを表す（ADR-0029）。
	ErrorNotBuddyPrimary ExportErrorCode = "not_buddy_primary"
)

// Target は、書き出す予定である。ScheduleID と RecurringScheduleID のどちらか 1 つを持つ。
type Target struct {
	FacilityID          string
	ScheduleID          string
	RecurringScheduleID string
}

// Export は、1 つの予定の書き出しの待ちである。書くときは、待ちを積んだ時点ではなく、書く時点の予定の内容を書く。
type Export struct {
	ID string
	Target
	Status ExportStatus
	// Revision は、終わっていない待ちに積み直すたびに 1 つ増える。書いている間に予定が変わったかを比べる。
	Revision int
	// Attempts は、書こうとした回数である。
	Attempts int
	// Overwrite は、外部の予定の etag を比べずに、buddy の内容で書き直すかである。
	Overwrite     bool
	ErrorCode     *ExportErrorCode
	NextAttemptAt time.Time
	// LockedUntil は、書いている処理が待ちを持つ期限で、取られていなければ nil である。
	LockedUntil *time.Time
	// CreatedAt は、待ちを足した時刻である。終わっていない待ちに積み直しても変わらない。
	CreatedAt time.Time
	UpdatedAt time.Time
}

// IsInReview は、待ちの状態が、確認が必要な状態（conflict か failed）かを返す。
func (e Export) IsInReview() bool {
	return e.Status == ExportConflict || e.Status == ExportFailed
}

// IsWriting は、書き出しの処理が、時刻 now に待ちを取って外部のカレンダーに書いているかを返す。
func (e Export) IsWriting(now time.Time) bool {
	return e.Status == ExportPending && e.LockedUntil != nil && e.LockedUntil.After(now)
}

// IsAcceptable は、外部のカレンダーの内容を buddy の予定に当てて、待ちを解けるかを返す。
// 単発の予定で、外部のカレンダーで予定が変わっていたか消えていた待ちだけが当たる。
func (e Export) IsAcceptable() bool {
	if e.ScheduleID == "" || e.Status != ExportConflict || e.ErrorCode == nil {
		return false
	}
	return *e.ErrorCode == ErrorPreconditionFailed || *e.ErrorCode == ErrorNotFound
}

// ExportResult は、1 回書こうとした結果である。Status が ExportPending なら、RetryAfter の後に書き直す。
// Released は、書こうとした回数に数えずに、すぐにほかの処理に渡すことを表す。止める合図で書けなかったときに使う。
type ExportResult struct {
	Status     ExportStatus
	ErrorCode  *ExportErrorCode
	RetryAfter time.Duration
	Released   bool
}

// ExportIssue は、確認が必要な書き出しの待ちと、その予定の日時と職員である。繰り返しの予定では、日付は最初の回の日付である。
// 予定のタイトルと利用者名は持たない。
type ExportIssue struct {
	Export
	// Cancelled は、単発の予定が buddy でキャンセルされているかである。
	Cancelled bool
	StaffID   string
	StaffName string
	Date      civil.Date
	StartTime civil.Time
	EndTime   civil.Time
	// EndsNextDay は、Date の翌日の EndTime に終わる予定のときに true である。
	EndsNextDay bool
}

// IsAcceptable は、外部のカレンダーの内容を buddy の予定に当てて、待ちを解けるかを返す。
// buddy でキャンセルした予定は、外部の内容に戻せないので当たらない。
func (i ExportIssue) IsAcceptable() bool {
	return i.Export.IsAcceptable() && !i.Cancelled
}
