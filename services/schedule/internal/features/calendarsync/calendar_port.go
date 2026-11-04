package calendarsync

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendar"
)

// Calendars は、同期と、確認が必要な待ちを外部の内容で解く操作が、結び付けたカレンダーと予定の対応を読み書きする。
// 見つからないときは apperr.ErrNotFound を返す。
type Calendars interface {
	// Get は、外したカレンダーも返す。
	Get(ctx context.Context, id string) (calendar.ExternalCalendar, error)
	// LinkBySchedule は、単発の予定 scheduleID の予定の対応を返す。
	LinkBySchedule(ctx context.Context, scheduleID string) (calendar.EventLink, error)
	// LinkByEvent は、カレンダー externalCalendarID の外部の予定 eventID の予定の対応を返す。
	LinkByEvent(ctx context.Context, externalCalendarID, eventID string) (calendar.EventLink, error)
	// CreateLink は、同じ外部の予定の対応があるときに apperr.ErrConflict を返す。
	CreateLink(ctx context.Context, l calendar.EventLink) error
	// UpdateLink は、予定の対応 id の etag と、同じにした時点の更新の番号を書く。
	UpdateLink(ctx context.Context, id, etag string, syncedVersion int) error
}

// ExportRepository は、同期と、確認が必要な待ちを外部の内容で解く操作が、書き出しの待ちを読み書きする。
// 見つからないときは apperr.ErrNotFound を返す。
type ExportRepository interface {
	// Enqueue は、t の終わっていない待ちがあれば Revision を 1 つ増やし、無ければ ID が id の待ちを足す。
	// 失敗した待ちは、pending に戻して回数を数え直す。確認が必要な待ち（conflict）は、状態を変えない。
	Enqueue(ctx context.Context, id string, t calendar.Target) error
	Get(ctx context.Context, id string) (calendar.Export, error)
	// Retry は、確認が必要な待ち id を、buddy の内容で書き直す pending の待ちにする。確認が必要な待ちでなければ apperr.ErrConflict を返す。
	Retry(ctx context.Context, id string) error
	// Open は、t の終わっていない待ちを返す。無いときは apperr.ErrNotFound を返す。
	Open(ctx context.Context, t calendar.Target) (calendar.Export, error)
	// Hold は、t の終わっていない待ちを、理由が code の確認が必要な待ち（conflict）にする。無ければ ID が id の待ちを足す。
	// Revision を 1 つ増やし、書いている処理の結果を捨てさせる。
	Hold(ctx context.Context, id string, t calendar.Target, code calendar.ExportErrorCode) error
	// Resolve は、確認が必要な待ち id を、外部のカレンダーの内容を buddy に当てて終えた待ちにする。
	// 確認が必要な待ちでないか、Revision が revision でない（読んだ後に積み直されたか保留し直された）ときは apperr.ErrConflict を返す。
	Resolve(ctx context.Context, id string, revision int) error
}
