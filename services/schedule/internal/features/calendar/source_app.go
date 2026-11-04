package calendar

import (
	"context"
	"strings"

	"github.com/Fukuemon/buddy/services/schedule/internal/kernel"
)

// maxCalendarIDLen は、外部のカレンダーの ID の長さの上限である。テーブルのカラムの長さと同じにする。
const maxCalendarIDLen = 1024

// source は、事業所 facilityID のサービスアカウントで外部のカレンダーを読む EventSource を返す。設定が無ければ ErrNotConfigured を返す。
func source(ctx context.Context, accounts Accounts, facilityID string) (EventSource, error) {
	if accounts == nil {
		return nil, ErrNotConfigured
	}
	return accounts.Source(ctx, facilityID)
}

func requireSource(ctx context.Context, accounts Accounts, facilityID, calendarID string) (EventSource, string, error) {
	src, err := source(ctx, accounts, facilityID)
	if err != nil {
		return nil, "", err
	}
	calendarID = strings.TrimSpace(calendarID)
	if err := kernel.ValidateText("カレンダーの ID", calendarID, maxCalendarIDLen); err != nil {
		return nil, "", err
	}
	return src, calendarID, nil
}
