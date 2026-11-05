package calendarexport_test

import (
	"testing"

	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendar"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendarexport"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/inmem"
	"github.com/Fukuemon/buddy/services/schedule/internal/ulid"
)

// Google カレンダーを予定の正本にする事業所の予定の変更は、職員がカレンダーを結び付けていても積まない（ADR-0008）。
func TestOutboxSkipsGooglePrimary(t *testing.T) {
	s := inmem.Seeded()
	s.Calendars[calID] = calendar.ExternalCalendar{ID: calID, FacilityID: inmem.FacilityID, StaffID: inmem.StaffID, Provider: calendar.ProviderGoogle, CalendarID: googleCalID}
	outbox := calendarexport.NewOutbox(inmem.Facilities{Store: s}, inmem.Exports{Store: s}, inmem.Calendars{Store: s}, ulid.Generator{})
	setSourceMode(s, organization.SourceGooglePrimary)
	if err := outbox.ScheduleChanged(t.Context(), inmem.FacilityID, inmem.StaffID, "SCHEDULE"); err != nil {
		t.Fatal(err)
	}
	if err := outbox.RecurringChanged(t.Context(), inmem.FacilityID, inmem.StaffID, inmem.RecurringID); err != nil {
		t.Fatal(err)
	}
	if len(s.Exports) != 0 {
		t.Fatalf("google_primary の事業所の待ち = %v, want 積まない", s.Exports)
	}

	setSourceMode(s, organization.SourceBuddyPrimary)
	if err := outbox.ScheduleChanged(t.Context(), inmem.FacilityID, inmem.StaffID, "SCHEDULE"); err != nil {
		t.Fatal(err)
	}
	if len(s.Exports) != 1 {
		t.Errorf("buddy_primary の事業所の待ち = %v, want 1 件", s.Exports)
	}
}

// setSourceMode は、事業所 inmem.FacilityID の正本のモードを m にする。
func setSourceMode(s *inmem.Store, m organization.SourceMode) {
	f := s.Facilities[inmem.FacilityID]
	f.SourceMode = m
	s.Facilities[inmem.FacilityID] = f
}
