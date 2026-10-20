// Package source は、照合の要求から予定の取得元を選ぶ。
package source

import (
	"errors"
	"fmt"

	"github.com/Fukuemon/buddy/apps/receipt-api/internal/check"
	"github.com/Fukuemon/buddy/apps/receipt-api/internal/gcal"
)

// Select が返すエラー。
var (
	// ErrNoSchedules は、予定の CSV も対象の月もないことを表す。
	ErrNoSchedules = errors.New("予定の CSV も対象の月もない")
	// ErrCalendarNotConfigured は、対象の月で呼ばれたが、Google カレンダーの設定がないことを表す。
	ErrCalendarNotConfigured = errors.New("サーバーに Google カレンダーの設定がない")
)

// InvalidMonthError は、対象の月の形が違うことを表す。
type InvalidMonthError struct {
	Err error
}

func (e *InvalidMonthError) Error() string {
	return e.Err.Error()
}

func (e *InvalidMonthError) Unwrap() error {
	return e.Err
}

// Request は、照合の要求のうち、予定の取得元を決める値である。
type Request struct {
	// Schedules は予定の CSV である。HasSchedules が false なら使わない。
	Schedules    []byte
	HasSchedules bool
	// Month は、対象の月（`2024-04`）である。空なら指定がない。
	Month string
}

// Selector は、予定の取得元を選ぶ。ゼロ値は予定の CSV だけを受ける。
type Selector struct {
	// Calendar は、Google カレンダーの予定を読む。nil なら Google カレンダーを使わない。
	Calendar *gcal.Reader
}

// Select は、予定の CSV があれば CSV を、無くて対象の月があれば Google カレンダーを取得元にする。
// どちらも無ければ ErrNoSchedules を、月の形が違えば *InvalidMonthError を、
// Calendar が nil なのに月で呼ばれたら ErrCalendarNotConfigured を返す。
func (s Selector) Select(req Request) (check.ScheduleSource, error) {
	if req.HasSchedules {
		return check.CSVSchedules{Data: req.Schedules}, nil
	}
	if req.Month == "" {
		return nil, ErrNoSchedules
	}
	month, err := gcal.ParseMonth(req.Month)
	if err != nil {
		return nil, &InvalidMonthError{Err: err}
	}
	if s.Calendar == nil {
		return nil, fmt.Errorf("対象の月 %s: %w", month, ErrCalendarNotConfigured)
	}
	return s.Calendar.Month(month), nil
}
