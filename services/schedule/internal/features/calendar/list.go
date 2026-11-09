package calendar

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/kernel"
)

// List は、事業所の外していないカレンダーを、最後の取り込みを付けて返す。
type List struct {
	calendars Repository
	guard     kernel.Guard
}

// NewList は List を作る。
func NewList(calendars Repository, guard kernel.Guard) List {
	return List{calendars: calendars, guard: guard}
}

// Do は、事業所の外していないカレンダーを、最後の取り込みを付けて返す。
func (u List) Do(ctx context.Context, facilityID string) ([]ExternalCalendar, error) {
	if err := u.guard(ctx); err != nil {
		return nil, err
	}
	return u.calendars.ListByFacility(ctx, facilityID)
}
