package calendar

import (
	"context"
	"errors"
	"time"

	"github.com/Fukuemon/buddy/apps/schedule-api/internal/apperr"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/civil"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/kernel"
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
	UpdatedAt     time.Time
}

// ExportResult は、1 回書こうとした結果である。Status が ExportPending なら、RetryAfter の後に書き直す。
// Released は、書こうとした回数に数えずに、すぐにほかの処理に渡すことを表す。止める合図で書けなかったときに使う。
type ExportResult struct {
	Status     ExportStatus
	ErrorCode  *ExportErrorCode
	RetryAfter time.Duration
	Released   bool
}

// ExportIssue は、確かめが要る書き出しの待ちと、その予定の日時と職員である。繰り返しの予定では、日付は最初の回の日付である。
// 予定のタイトルと利用者名は持たない。
type ExportIssue struct {
	Export
	StaffID   string
	StaffName string
	Date      civil.Date
	StartTime civil.Time
	EndTime   civil.Time
}

// ExportRepository は、書き出しの待ちを読み書きする。見つからないときは apperr.ErrNotFound を返す。
type ExportRepository interface {
	// Enqueue は、t の終わっていない待ちがあれば Revision を 1 つ増やし、無ければ ID が id の待ちを足す。
	// 失敗した待ちは、pending に戻して回数を数え直す。確かめが要る待ち（conflict）は、状態を変えない。
	Enqueue(ctx context.Context, id string, t Target) error
	// Claim は、書く時刻を過ぎた pending の待ちを max 件まで取り、lease の間はほかの処理に渡さないようにし、
	// 書こうとした回数を 1 つ増やして返す。
	Claim(ctx context.Context, max int, lease time.Duration) ([]Export, error)
	// Finish は、待ち e を書いた結果 r を書く。書いている間に e が積み直されていれば、結果によらず待ちを pending に戻して数え直す。
	// e を取った後にほかの処理が同じ待ちを取り直していれば（lease が切れたとき）、何も書かない。
	Finish(ctx context.Context, e Export, r ExportResult) error
	Get(ctx context.Context, id string) (Export, error)
	// ListIssues は、事業所の確かめが要る待ち（conflict と failed）を、新しく変わった順に返す。
	ListIssues(ctx context.Context, facilityID string) ([]ExportIssue, error)
	// Retry は、確かめが要る待ち id を、buddy の内容で書き直す pending の待ちにする。確かめが要る待ちでなければ apperr.ErrConflict を返す。
	Retry(ctx context.Context, id string) error
}

// ExportCalendars は、書き出しの待ちを積むかを決めるために、職員のカレンダーと予定の対応を読む。
type ExportCalendars interface {
	// ActiveByStaff は、職員 staffID に結び付けた外していないカレンダーを返す。無いときは apperr.ErrNotFound を返す。
	ActiveByStaff(ctx context.Context, staffID string) (ExternalCalendar, error)
	// LinkBySchedule は、単発の予定 scheduleID の予定の対応を返す。無いときは apperr.ErrNotFound を返す。
	LinkBySchedule(ctx context.Context, scheduleID string) (Link, error)
	// LinkByRecurringSchedule は、繰り返しの予定 recurringScheduleID の予定の対応を返す。無いときは apperr.ErrNotFound を返す。
	LinkByRecurringSchedule(ctx context.Context, recurringScheduleID string) (Link, error)
	Get(ctx context.Context, id string) (ExternalCalendar, error)
}

// Outbox は、schedule.Exports を実装し、予定の変更を書き出しの待ちに積む。
// 積むのは、予定の職員が外していないカレンダーを結び付けているときと、予定の対応のカレンダーを外していないとき（職員が替わり、
// 前のカレンダーの予定を消すとき）だけである。
type Outbox struct {
	exports   ExportRepository
	calendars ExportCalendars
	ids       kernel.IDGenerator
}

// NewOutbox は Outbox を作る。
func NewOutbox(exports ExportRepository, calendars ExportCalendars, ids kernel.IDGenerator) *Outbox {
	return &Outbox{exports: exports, calendars: calendars, ids: ids}
}

// ScheduleChanged は、単発の予定 scheduleID の変更を積む。
func (o *Outbox) ScheduleChanged(ctx context.Context, facilityID, staffID, scheduleID string) error {
	return o.enqueue(ctx, staffID, Target{FacilityID: facilityID, ScheduleID: scheduleID}, func(ctx context.Context) (Link, error) {
		return o.calendars.LinkBySchedule(ctx, scheduleID)
	})
}

// RecurringChanged は、繰り返しの予定 recurringScheduleID の変更を積む。
func (o *Outbox) RecurringChanged(ctx context.Context, facilityID, staffID, recurringScheduleID string) error {
	return o.enqueue(ctx, staffID, Target{FacilityID: facilityID, RecurringScheduleID: recurringScheduleID}, func(ctx context.Context) (Link, error) {
		return o.calendars.LinkByRecurringSchedule(ctx, recurringScheduleID)
	})
}

func (o *Outbox) enqueue(ctx context.Context, staffID string, t Target, linkOf func(context.Context) (Link, error)) error {
	ok, err := o.writable(ctx, staffID, linkOf)
	if err != nil || !ok {
		return err
	}
	return o.exports.Enqueue(ctx, o.ids.NewID(), t)
}

// writable は、職員 staffID の予定の変更を書く先のカレンダーがあるかを返す。linkOf は予定の対応を読む。
func (o *Outbox) writable(ctx context.Context, staffID string, linkOf func(context.Context) (Link, error)) (bool, error) {
	_, err := o.calendars.ActiveByStaff(ctx, staffID)
	if err == nil {
		return true, nil
	}
	if !errors.Is(err, apperr.ErrNotFound) {
		return false, err
	}
	l, err := linkOf(ctx)
	if errors.Is(err, apperr.ErrNotFound) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	c, err := o.calendars.Get(ctx, l.ExternalCalendarID)
	if err != nil {
		return false, err
	}
	return c.DisabledAt == nil, nil
}
