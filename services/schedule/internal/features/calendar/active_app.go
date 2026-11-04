package calendar

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/kernel"
)

// Active は、calendars から id のカレンダーを読み、外していなければ返す。
// カレンダーが無いか外したときは apperr.ErrNotFound を返す。
func Active(ctx context.Context, calendars kernel.Finder[ExternalCalendar], id string) (ExternalCalendar, error) {
	c, err := calendars.Get(ctx, id)
	if err != nil {
		return ExternalCalendar{}, err
	}
	if c.DisabledAt != nil {
		return ExternalCalendar{}, apperr.ErrNotFound
	}
	return c, nil
}
