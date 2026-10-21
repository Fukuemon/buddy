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
	// ErrNoOrg は、対象の月で呼ばれたが、トークンに組織がなく、読むカレンダーを決められないことを表す。
	ErrNoOrg = errors.New("トークンに組織がない")
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
	// OrgID は、トークンの組織である。Google カレンダーは、この組織のカレンダーだけを読む。
	OrgID string
}

// Selector は、予定の取得元を選ぶ。ゼロ値は予定の CSV だけを受ける。
type Selector struct {
	// Calendar は、Google カレンダーの予定を読む。nil なら Google カレンダーを使わない。
	Calendar *gcal.Reader
}

// Select は、予定の CSV があれば CSV を、無くて対象の月があれば req.OrgID の Google カレンダーを取得元にする。
// どちらも無ければ ErrNoSchedules を、月の形が違えば *InvalidMonthError を、月で呼ばれて OrgID が空なら ErrNoOrg を、
// Calendar が nil か組織のカレンダーが無いなら ErrCalendarNotConfigured を返す。
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
	if req.OrgID == "" {
		return nil, ErrNoOrg
	}
	if s.Calendar == nil {
		return nil, fmt.Errorf("対象の月 %s: %w", month, ErrCalendarNotConfigured)
	}
	src, ok := s.Calendar.Month(req.OrgID, month)
	if !ok {
		return nil, fmt.Errorf("組織 %s: %w", req.OrgID, ErrCalendarNotConfigured)
	}
	return src, nil
}
