package calendar

import "context"

// List は、事業所の外していないカレンダーを、最後の取り込みを付けて返す。
func (u *Usecase) List(ctx context.Context, facilityID string) ([]ExternalCalendar, error) {
	if err := u.guard(ctx); err != nil {
		return nil, err
	}
	return u.deps.Calendars.ListByFacility(ctx, facilityID)
}
