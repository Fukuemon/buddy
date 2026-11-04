package main

import (
	"context"
	"fmt"

	"google.golang.org/api/calendar/v3"

	"github.com/Fukuemon/buddy/packages/go/gcalauth"

	"github.com/Fukuemon/buddy/services/receipt/internal/gcal"
)

// newCalendarReader は、cfg.calendarsFile のカレンダーを、カレンダーの組織のサービスアカウントで読む gcal.Reader を返す。
// 設定が無ければ nil を返す。サービスアカウントの対応が無い組織のカレンダーがあれば、起動しない。
func newCalendarReader(ctx context.Context, cfg config) (*gcal.Reader, error) {
	if cfg.calendarsFile == "" {
		return nil, nil
	}
	cals, err := gcal.LoadCalendars(cfg.calendarsFile)
	if err != nil {
		return nil, err
	}
	accounts, err := gcalauth.LoadAccounts(cfg.accountsFile)
	if err != nil {
		return nil, err
	}
	if err := requireAccounts(cals, accounts); err != nil {
		return nil, err
	}
	clients, err := gcalauth.New(ctx, gcalauth.Config{Accounts: accounts, Scope: calendar.CalendarReadonlyScope, Endpoint: cfg.calendarEndpoint})
	if err != nil {
		return nil, err
	}
	return gcal.NewReader(clients, cals), nil
}

// requireAccounts は、cals の全ての組織に、accounts のサービスアカウントの対応があるかを確認する。
func requireAccounts(cals []gcal.Calendar, accounts gcalauth.Accounts) error {
	for _, c := range cals {
		if _, ok := accounts.Of(c.OrgID); !ok {
			return fmt.Errorf("組織 %s のサービスアカウントが GOOGLE_CALENDAR_SERVICE_ACCOUNTS_FILE に無い", c.OrgID)
		}
	}
	return nil
}
