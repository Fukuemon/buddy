package calendar

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
)

// active は、外していないカレンダーを返す。無いか外したときは apperr.ErrNotFound を返す。
func active(ctx context.Context, calendars Repository, id string) (ExternalCalendar, error) {
	c, err := calendars.Get(ctx, id)
	if err != nil {
		return ExternalCalendar{}, err
	}
	if c.DisabledAt != nil {
		return ExternalCalendar{}, apperr.ErrNotFound
	}
	return c, nil
}
