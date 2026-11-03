package calendar

import (
	"context"
	"time"
)

// Repository は、外部のカレンダーと、その取り込みの記録と予定の対応を読み書きする。見つからないときは apperr.ErrNotFound を返す。
type Repository interface {
	// Get は、外したカレンダーも返す。
	Get(ctx context.Context, id string) (ExternalCalendar, error)
	// GetForUpdate は、トランザクションの終わりまでカレンダーの行に排他のロックを取り、Get と同じ値を返す。トランザクションの中で呼ぶ。
	GetForUpdate(ctx context.Context, id string) (ExternalCalendar, error)
	// FindByCalendarID は、provider と calendarID のカレンダーを、外したものも含めて返す。
	FindByCalendarID(ctx context.Context, provider, calendarID string) (ExternalCalendar, error)
	// ListByFacility は、事業所の外していないカレンダーを、最後の取り込みを付けて作った順に返す。
	ListByFacility(ctx context.Context, facilityID string) ([]ExternalCalendar, error)
	// Create は、職員に外していないカレンダーがあるときと、同じ外部のカレンダーがあるときに apperr.ErrConflict を返す。
	Create(ctx context.Context, c ExternalCalendar) error
	// Enable は、外したカレンダーを結び付け直す。職員に外していないカレンダーがあるときは apperr.ErrConflict を返す。
	Enable(ctx context.Context, id string) error
	// Disable は、カレンダーを外す。外したカレンダーでは何もしない。
	Disable(ctx context.Context, id string) error

	// RunningSince は、カレンダーの取り込みのうち、since より後に始めた running のものがあるかを返す。
	RunningSince(ctx context.Context, externalCalendarID string, since time.Time) (bool, error)
	// CreateRun は、取り込みの記録を足す。StartedAt は DB が決める。
	CreateRun(ctx context.Context, r ImportRun) error
	// FinishRun は、取り込みの記録の状態と件数を r の値にし、終わった時刻を入れて、記録を返す。
	FinishRun(ctx context.Context, r ImportRun) (ImportRun, error)

	// ListLinks は、カレンダーの予定の対応を返す。
	ListLinks(ctx context.Context, externalCalendarID string) ([]Link, error)
	// CreateLink は、同じ外部の予定の対応があるときに apperr.ErrConflict を返す。
	CreateLink(ctx context.Context, l Link) error

	// ActiveByStaff は、職員 staffID に結び付けた外していないカレンダーを返す。
	ActiveByStaff(ctx context.Context, staffID string) (ExternalCalendar, error)
	// LinkBySchedule は、単発の予定 scheduleID の予定の対応を返す。
	LinkBySchedule(ctx context.Context, scheduleID string) (Link, error)
	// LinkByRecurringSchedule は、繰り返しの予定 recurringScheduleID の予定の対応を返す。
	LinkByRecurringSchedule(ctx context.Context, recurringScheduleID string) (Link, error)
	// LinkByEvent は、カレンダー externalCalendarID の外部の予定 eventID の予定の対応を返す。
	LinkByEvent(ctx context.Context, externalCalendarID, eventID string) (Link, error)
	// UpdateLink は、予定の対応 id の etag と、同じにした時点の更新の番号を書く。
	UpdateLink(ctx context.Context, id, etag string, syncedVersion int) error
	// DeleteLink は、予定の対応 id を消す。無くてもエラーにしない。
	DeleteLink(ctx context.Context, id string) error
}
