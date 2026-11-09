package scheduleview_test

import (
	"errors"
	"testing"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/scheduleview"
)

func TestListQueryValidate(t *testing.T) {
	from, to := civil.Date{Year: 2026, Month: 10, Day: 20}, civil.Date{Year: 2026, Month: 10, Day: 19}
	if err := (scheduleview.ListQuery{DateFrom: &from, DateTo: &to}).Validate(); !errors.Is(err, apperr.ErrInvalidInput) {
		t.Fatalf("err = %v, want ErrInvalidInput", err)
	}
	if err := (scheduleview.ListQuery{DateFrom: &to, DateTo: &from}).Validate(); err != nil {
		t.Fatal(err)
	}
}
