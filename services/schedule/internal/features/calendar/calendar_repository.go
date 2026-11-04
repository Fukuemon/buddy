package calendar

import (
	"context"
)

// Repository は、職員に結び付けた外部のカレンダーを読み書きする。見つからないときは apperr.ErrNotFound を返す。
type Repository interface {
	// Get は、外したカレンダーも返す。
	Get(ctx context.Context, id string) (ExternalCalendar, error)
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
}
