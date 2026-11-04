package calendar

import (
	"context"
	"strings"

	"github.com/Fukuemon/buddy/services/schedule/internal/kernel"
)

// maxCalendarIDLen は、外部のカレンダーの ID の長さの上限である。テーブルのカラムの長さと同じにする。
const maxCalendarIDLen = 1024

// Source は、事業所 facilityID のサービスアカウントで外部のカレンダーを読む EventSource を返す。
// accounts が nil（サービスアカウントの設定が無い）ときは ErrNotConfigured を返す。
func Source(ctx context.Context, accounts Accounts, facilityID string) (EventSource, error) {
	if accounts == nil {
		return nil, ErrNotConfigured
	}
	return accounts.Source(ctx, facilityID)
}

func requireSource(ctx context.Context, accounts Accounts, facilityID, calendarID string) (EventSource, string, error) {
	src, err := Source(ctx, accounts, facilityID)
	if err != nil {
		return nil, "", err
	}
	calendarID = strings.TrimSpace(calendarID)
	if err := kernel.ValidateText("カレンダーの ID", calendarID, maxCalendarIDLen); err != nil {
		return nil, "", err
	}
	return src, calendarID, nil
}
