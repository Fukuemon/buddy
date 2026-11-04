package calendarimport

import (
	"context"
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendar"
)

// Calendars は、取り込みが、結び付けたカレンダー、取り込みの記録、予定の対応を読み書きする。
// 見つからないときは apperr.ErrNotFound を返す。
type Calendars interface {
	// Get は、外したカレンダーも返す。
	Get(ctx context.Context, id string) (calendar.ExternalCalendar, error)
	// GetForUpdate は、トランザクションの終わりまでカレンダーの行に排他のロックを取り、Get と同じ値を返す。トランザクションの中で呼ぶ。
	GetForUpdate(ctx context.Context, id string) (calendar.ExternalCalendar, error)
	// RunningSince は、カレンダーの取り込みのうち、since より後に始めた running のものがあるかを返す。
	RunningSince(ctx context.Context, externalCalendarID string, since time.Time) (bool, error)
	// CreateRun は、取り込みの記録を足す。StartedAt は DB が決める。
	CreateRun(ctx context.Context, r calendar.ImportRun) error
	// FinishRun は、取り込みの記録の状態と件数を r の値にし、終わった時刻を入れて、記録を返す。
	FinishRun(ctx context.Context, r calendar.ImportRun) (calendar.ImportRun, error)
	// ListByFacility は、事業所の外していないカレンダーを、最後の取り込みを付けて作った順に返す。
	ListByFacility(ctx context.Context, facilityID string) ([]calendar.ExternalCalendar, error)
	// ListLinks は、カレンダーの予定の対応を返す。
	ListLinks(ctx context.Context, externalCalendarID string) ([]calendar.EventLink, error)
	// CreateLink は、同じ外部の予定の対応があるときに apperr.ErrConflict を返す。
	CreateLink(ctx context.Context, l calendar.EventLink) error
}
