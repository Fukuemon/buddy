package calendar_test

import (
	"errors"
	"testing"

	calendarv3 "google.golang.org/api/calendar/v3"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendar"
	"github.com/Fukuemon/buddy/services/schedule/internal/gcal/gcaltest"
	"github.com/Fukuemon/buddy/services/schedule/internal/inmem"
)

func TestLink(t *testing.T) {
	srv := &gcaltest.Server{Calendars: map[string][][]*calendarv3.Event{googleCalID: {}, "other@example.com": {}}}
	e := newEnv(t, srv)
	delete(e.store.Calendars, calID)

	c, err := e.uc.Link(e.ctx, inmem.FacilityID, inmem.StaffID, " staff@example.com ")
	if err != nil {
		t.Fatal(err)
	}
	if c.StaffID != inmem.StaffID || c.CalendarID != googleCalID || c.Provider != calendar.ProviderGoogle {
		t.Errorf("結び付けたカレンダー = %+v", c)
	}
	for _, tt := range []struct {
		name, staffID, calendarID string
		want                      error
		code                      string
	}{
		{"すでに結び付いている", inmem.StaffID, googleCalID, apperr.ErrConflict, calendar.CodeCalendarLinked},
		{"職員にほかのカレンダーがある", inmem.StaffID, "other@example.com", apperr.ErrConflict, calendar.CodeStaffHasCalendar},
		{"ほかの職員に結び付いている", inmem.CompanionID, googleCalID, apperr.ErrConflict, calendar.CodeCalendarTaken},
		{"別の事業所の職員", inmem.OtherStaffID, "other@example.com", apperr.ErrInvalidInput, ""},
		{"読めないカレンダー", inmem.CompanionID, "nobody@example.com", calendar.ErrUnreadable, ""},
	} {
		t.Run(tt.name, func(t *testing.T) {
			_, err := e.uc.Link(e.ctx, inmem.FacilityID, tt.staffID, tt.calendarID)
			if !errors.Is(err, tt.want) {
				t.Fatalf("err = %v, want %v", err, tt.want)
			}
			var ce *apperr.ConflictError
			if tt.code != "" && (!errors.As(err, &ce) || ce.Code != tt.code) {
				t.Errorf("err = %#v, want code %s", err, tt.code)
			}
		})
	}

	if err := e.uc.Unlink(e.ctx, c.ID); err != nil {
		t.Fatal(err)
	}
	if list, err := e.uc.List(e.ctx, inmem.FacilityID); err != nil || len(list) != 0 {
		t.Errorf("外した後の一覧 = %v, %v", list, err)
	}
	again, err := e.uc.Link(e.ctx, inmem.FacilityID, inmem.StaffID, googleCalID)
	if err != nil {
		t.Fatal(err)
	}
	if again.ID != c.ID || again.DisabledAt != nil {
		t.Errorf("結び付け直したカレンダー = %+v, want 外したレコード %s", again, c.ID)
	}
}
