package calendar

import (
	"context"
	"time"
)

// ExportRepository は、書き出しの待ちを読み書きする。見つからないときは apperr.ErrNotFound を返す。
type ExportRepository interface {
	// Enqueue は、t の終わっていない待ちがあれば Revision を 1 つ増やし、無ければ ID が id の待ちを足す。
	// 失敗した待ちは、pending に戻して回数を数え直す。確認が必要な待ち（conflict）は、状態を変えない。
	Enqueue(ctx context.Context, id string, t Target) error
	// Claim は、書く時刻を過ぎた pending の待ちを max 件まで取り、lease の間はほかの処理に渡さないようにし、
	// 書こうとした回数を 1 つ増やして返す。
	Claim(ctx context.Context, max int, lease time.Duration) ([]Export, error)
	// Finish は、待ち e を書いた結果 r を書く。書いている間に e が積み直されていれば、結果によらず待ちを pending に戻して数え直す。
	// e を取った後にほかの処理が同じ待ちを取り直していれば（lease が切れたとき）、何も書かない。
	Finish(ctx context.Context, e Export, r ExportResult) error
	Get(ctx context.Context, id string) (Export, error)
	// ListIssues は、事業所の確認が必要な待ち（conflict と failed）を、新しく変わった順に返す。
	ListIssues(ctx context.Context, facilityID string) ([]ExportIssue, error)
	// Retry は、確認が必要な待ち id を、buddy の内容で書き直す pending の待ちにする。確認が必要な待ちでなければ apperr.ErrConflict を返す。
	Retry(ctx context.Context, id string) error
	// Open は、t の終わっていない待ちを返す。無いときは apperr.ErrNotFound を返す。
	Open(ctx context.Context, t Target) (Export, error)
	// Hold は、t の終わっていない待ちを、理由が code の確認が必要な待ち（conflict）にする。無ければ ID が id の待ちを足す。
	// Revision を 1 つ増やし、書いている処理の結果を捨てさせる。
	Hold(ctx context.Context, id string, t Target, code ExportErrorCode) error
	// Resolve は、確認が必要な待ち id を、外部のカレンダーの内容を buddy に当てて終えた待ちにする。
	// 確認が必要な待ちでないか、Revision が revision でない（読んだ後に積み直されたか保留し直された）ときは apperr.ErrConflict を返す。
	Resolve(ctx context.Context, id string, revision int) error
}

// ExportCalendars は、書き出しの待ちを積むかを決めるために、職員のカレンダーと予定の対応を読む。
type ExportCalendars interface {
	// ActiveByStaff は、職員 staffID に結び付けた外していないカレンダーを返す。無いときは apperr.ErrNotFound を返す。
	ActiveByStaff(ctx context.Context, staffID string) (ExternalCalendar, error)
	// LinkBySchedule は、単発の予定 scheduleID の予定の対応を返す。無いときは apperr.ErrNotFound を返す。
	LinkBySchedule(ctx context.Context, scheduleID string) (EventLink, error)
	// LinkByRecurringSchedule は、繰り返しの予定 recurringScheduleID の予定の対応を返す。無いときは apperr.ErrNotFound を返す。
	LinkByRecurringSchedule(ctx context.Context, recurringScheduleID string) (EventLink, error)
	Get(ctx context.Context, id string) (ExternalCalendar, error)
}
