package calendar

import (
	"context"
	"strings"

	"github.com/Fukuemon/buddy/services/schedule/internal/kernel"
)

// maxCalendarIDLen は、外部のカレンダーの ID の長さの上限である。テーブルのカラムの長さと同じにする。
const maxCalendarIDLen = 1024

// source は、事業所 facilityID のサービスアカウントで外部のカレンダーを読む EventSource を返す。設定が無ければ ErrNotConfigured を返す。
func (u *App) source(ctx context.Context, facilityID string) (EventSource, error) {
	if u.deps.Accounts == nil {
		return nil, ErrNotConfigured
	}
	return u.deps.Accounts.Source(ctx, facilityID)
}

func (u *App) requireSource(ctx context.Context, facilityID, calendarID string) (EventSource, string, error) {
	src, err := u.source(ctx, facilityID)
	if err != nil {
		return nil, "", err
	}
	calendarID = strings.TrimSpace(calendarID)
	if err := kernel.ValidateText("カレンダーの ID", calendarID, maxCalendarIDLen); err != nil {
		return nil, "", err
	}
	return src, calendarID, nil
}
