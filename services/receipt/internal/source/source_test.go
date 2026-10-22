package source

import (
	"errors"
	"testing"

	"github.com/Fukuemon/buddy/services/receipt/internal/check"
	"github.com/Fukuemon/buddy/services/receipt/internal/gcal"
	"github.com/Fukuemon/buddy/services/receipt/internal/gcal/gcaltest"
)

func TestSelect(t *testing.T) {
	withCalendar := Selector{Calendar: gcal.NewReader(gcaltest.Same{}, []gcal.Calendar{{ID: "a@example.com", OrgID: "org-a"}})}

	src, err := withCalendar.Select(Request{Schedules: []byte("x"), HasSchedules: true, Month: "2024-04"})
	if _, ok := src.(check.CSVSchedules); err != nil || !ok {
		t.Errorf("CSV と月の両方: %T, %v", src, err)
	}
	src, err = withCalendar.Select(Request{Month: "2024-04", OrgID: "org-a"})
	if _, ok := src.(check.CSVSchedules); err != nil || src == nil || ok {
		t.Errorf("月だけ: %T, %v", src, err)
	}
	if _, err := withCalendar.Select(Request{}); !errors.Is(err, ErrNoSchedules) {
		t.Errorf("どちらも無い: %v", err)
	}
	if _, err := withCalendar.Select(Request{Month: "2024/04"}); !errors.As(err, new(*InvalidMonthError)) {
		t.Errorf("月の形が違う: %v", err)
	}
	if _, err := withCalendar.Select(Request{Month: "2024-04"}); !errors.Is(err, ErrNoOrg) {
		t.Errorf("組織が無い: %v", err)
	}
	if _, err := withCalendar.Select(Request{Month: "2024-04", OrgID: "org-b"}); !errors.Is(err, ErrCalendarNotConfigured) {
		t.Errorf("組織のカレンダーが無い: %v", err)
	}
	if _, err := (Selector{}).Select(Request{Month: "2024-04", OrgID: "org-a"}); !errors.Is(err, ErrCalendarNotConfigured) {
		t.Errorf("設定が無い: %v", err)
	}
}
