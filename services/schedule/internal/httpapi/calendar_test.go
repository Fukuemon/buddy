package httpapi_test

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"testing"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/calendar"
	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/httpapi"
	"github.com/Fukuemon/buddy/services/schedule/internal/schedule"
)

const calendarID = "01M3TD000000000000000000C0"

// fakeCalendars は、受け取った引数を記録し、err があればそれを返す。
type fakeCalendars struct {
	err           error
	lastRange     calendar.Range
	lastDecisions []calendar.Decision
	preview       calendar.Preview
	lastFacility  string
}

func (f *fakeCalendars) ServiceAccount(_ context.Context, facilityID string) (string, error) {
	f.lastFacility = facilityID
	return "buddy@example.iam.gserviceaccount.com", f.err
}

func (f *fakeCalendars) List(context.Context, string) ([]calendar.ExternalCalendar, error) {
	return []calendar.ExternalCalendar{{ID: calendarID, Provider: calendar.ProviderGoogle}}, f.err
}

func (f *fakeCalendars) Check(_ context.Context, facilityID, _ string) error {
	f.lastFacility = facilityID
	return f.err
}

func (f *fakeCalendars) Link(_ context.Context, facilityID, staffID, calendarID string) (calendar.ExternalCalendar, error) {
	return calendar.ExternalCalendar{ID: calendarID, FacilityID: facilityID, StaffID: staffID, Provider: calendar.ProviderGoogle}, f.err
}

func (f *fakeCalendars) Unlink(context.Context, string) error { return f.err }

func (f *fakeCalendars) Preview(_ context.Context, _ string, rng calendar.Range) (calendar.Preview, error) {
	f.lastRange = rng
	p := f.preview
	p.Range = rng
	return p, f.err
}

func (f *fakeCalendars) Import(_ context.Context, _ string, rng calendar.Range, decisions []calendar.Decision) (calendar.ImportResult, error) {
	f.lastRange, f.lastDecisions = rng, decisions
	return calendar.ImportResult{Run: calendar.ImportRun{ID: calendarID, ExternalCalendarID: calendarID, RangeStart: rng.Start, RangeEnd: rng.End, Status: calendar.RunSucceeded, ImportedCount: 2}, AlreadyImported: 1}, f.err
}

func (f *fakeCalendars) ListExportIssues(context.Context, string) ([]calendar.ExportIssue, error) {
	code := calendar.ErrorPreconditionFailed
	return []calendar.ExportIssue{{
		Export: calendar.Export{
			ID: calendarID, Target: calendar.Target{ScheduleID: scheduleID}, Status: calendar.ExportConflict, Attempts: 1, ErrorCode: &code,
		},
		StaffID: staffID, StaffName: "職員A", Date: civil.Date{Year: 2026, Month: 11, Day: 4},
		StartTime: civil.Time{Hour: 10}, EndTime: civil.Time{Hour: 11},
	}}, f.err
}

func (f *fakeCalendars) RetryExport(_ context.Context, id string) (calendar.Export, error) {
	return calendar.Export{ID: id, Target: calendar.Target{ScheduleID: scheduleID}, Status: calendar.ExportPending, Overwrite: true}, f.err
}

func (f *fakeCalendars) AcceptExport(_ context.Context, id string) (calendar.Export, error) {
	return calendar.Export{ID: id, Target: calendar.Target{ScheduleID: scheduleID}, Status: calendar.ExportSucceeded}, f.err
}

func newCalendarRouter(c *fakeCalendars) http.Handler {
	return httpapi.NewRouter(httpapi.Usecases{Calendars: c, Auth: fakeAuth{}}, httpapi.RouterConfig{
		Logger:   slog.New(slog.NewTextHandler(io.Discard, nil)),
		Verifier: testVerifier,
	})
}

func TestCalendarErrorStatus(t *testing.T) {
	previewTarget := "/v1/external_calendars/" + calendarID + "/import_previews"
	const rangeBody = `{"range_start":"2026-11-01","range_end":"2026-11-30"}`
	tests := []struct {
		name     string
		err      error
		method   string
		target   string
		body     string
		wantCode int
		wantBody string
	}{
		{name: "カレンダーを読めない", err: fmt.Errorf("x: %w", calendar.ErrUnreadable), method: http.MethodPost, target: previewTarget, body: rangeBody,
			wantCode: http.StatusUnprocessableEntity, wantBody: "calendar_unreadable"},
		{name: "Google に届かない", err: fmt.Errorf("x: %w", calendar.ErrUnavailable), method: http.MethodPost, target: previewTarget, body: rangeBody,
			wantCode: http.StatusBadGateway, wantBody: "calendar_unavailable"},
		{name: "設定が無い", err: calendar.ErrNotConfigured, method: http.MethodGet, target: "/v1/facilities/" + facilityID + "/calendar_service_account",
			wantCode: http.StatusServiceUnavailable, wantBody: "calendar_not_configured"},
		{name: "職員の管理の権限が無い", err: apperr.ErrForbidden, method: http.MethodGet, target: "/v1/facilities/" + facilityID + "/external_calendars",
			wantCode: http.StatusForbidden, wantBody: "forbidden"},
		{name: "外したカレンダー", err: apperr.ErrNotFound, method: http.MethodDelete, target: "/v1/external_calendars/" + calendarID,
			wantCode: http.StatusNotFound, wantBody: "not_found"},
		{name: "取り込みが進んでいる", err: apperr.ConflictCode(calendar.CodeImportRunning, "進んでいます"), method: http.MethodPost,
			target: "/v1/external_calendars/" + calendarID + "/imports", body: `{"range_start":"2026-11-01","range_end":"2026-11-30","decisions":[]}`,
			wantCode: http.StatusConflict, wantBody: "import_running"},
		{name: "確かめが要る書き出しでない", err: apperr.ConflictCode(calendar.CodeExportNotInReview, "確かめが要る書き出しではありません"), method: http.MethodPost,
			target: "/v1/calendar_exports/" + calendarID + "/retries", wantCode: http.StatusConflict, wantBody: "export_not_in_review"},
		{name: "Google カレンダーの内容で解けない", err: apperr.ConflictCode(calendar.CodeExportNotAcceptable, "解けません"), method: http.MethodPost,
			target: "/v1/calendar_exports/" + calendarID + "/acceptances", wantCode: http.StatusConflict, wantBody: "export_not_acceptable"},
		{name: "Google カレンダーの予定を読み替えられない", err: apperr.ConflictCode(calendar.CodeExternalChangeUnappliable, "読み替えられません"),
			method: http.MethodPost, target: "/v1/calendar_exports/" + calendarID + "/acceptances",
			wantCode: http.StatusConflict, wantBody: "external_change_unappliable"},
		{name: "解くときにカレンダーを読めない", err: fmt.Errorf("x: %w", calendar.ErrUnreadable), method: http.MethodPost,
			target: "/v1/calendar_exports/" + calendarID + "/acceptances", wantCode: http.StatusUnprocessableEntity, wantBody: "calendar_unreadable"},
		{name: "期間が逆", method: http.MethodPost, target: previewTarget, body: `{"range_start":"2026-11-30","range_end":"2026-11-01"}`,
			wantCode: http.StatusBadRequest, wantBody: "invalid_input"},
		{name: "取り込み方の値が定義に無い", method: http.MethodPost, target: "/v1/external_calendars/" + calendarID + "/imports",
			body:     `{"range_start":"2026-11-01","range_end":"2026-11-30","decisions":[{"external_event_id":"e1","revision":"r1","action":"maybe"}]}`,
			wantCode: http.StatusBadRequest, wantBody: "invalid_input"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec, body := do(t, newCalendarRouter(&fakeCalendars{err: tt.err}), tt.method, tt.target, tt.body)
			if rec.Code != tt.wantCode {
				t.Fatalf("status = %d, body = %s", rec.Code, rec.Body)
			}
			if body["code"] != tt.wantBody {
				t.Errorf("body = %v", body)
			}
			if strings.Contains(rec.Body.String(), "x: ") {
				t.Error("内部のエラーの文を返した")
			}
		})
	}
}

// サービスアカウントとカレンダーの確かめは、パスの事業所のアカウントで行う。
func TestCalendarAccountOfFacility(t *testing.T) {
	f := &fakeCalendars{}
	rec, body := do(t, newCalendarRouter(f), http.MethodGet, "/v1/facilities/"+facilityID+"/calendar_service_account", "")
	if rec.Code != http.StatusOK || body["email"] != "buddy@example.iam.gserviceaccount.com" || f.lastFacility != facilityID {
		t.Errorf("service account: status = %d, body = %v, facility = %q", rec.Code, body, f.lastFacility)
	}
	f = &fakeCalendars{}
	rec, _ = do(t, newCalendarRouter(f), http.MethodPost, "/v1/facilities/"+facilityID+"/external_calendars/check", `{"calendar_id":"cal"}`)
	if rec.Code != http.StatusOK || f.lastFacility != facilityID {
		t.Errorf("check: status = %d, body = %s, facility = %q", rec.Code, rec.Body, f.lastFacility)
	}
}

func TestPreviewCalendarImport(t *testing.T) {
	d := civil.Date{Year: 2026, Month: 11, Day: 3}
	day := 2
	f := &fakeCalendars{preview: calendar.Preview{
		Counts: calendar.Counts{Import: 1, ImportVisit: 1, NeedsReview: 1, Skipped: 1},
		NeedsReview: []calendar.ReviewItem{{
			ExternalEventID: "weekly", Date: d, StartTime: civil.Time{Hour: 10}, EndTime: civil.Time{Hour: 10, Minute: 30},
			Service: "訪看I2", Client: "利用者B", Reason: calendar.ReviewPatientAmbiguous,
			Recurrence: &schedule.Rule{Frequency: schedule.Weekly, DayOfWeek: &day},
			Candidates: []calendar.PatientRef{{ID: "PB1", Name: "利用者B", AssignedStaffName: "職員A"}},
		}},
		Skipped: []calendar.Skipped{{Date: &d, AllDay: true, Reason: calendar.SkipAllDay}},
	}}
	rec, body := do(t, newCalendarRouter(f), http.MethodPost, "/v1/external_calendars/"+calendarID+"/import_previews",
		`{"range_start":"2026-11-01","range_end":"2026-11-30"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body)
	}
	if f.lastRange.End != (civil.Date{Year: 2026, Month: 11, Day: 30}) {
		t.Errorf("Range = %+v", f.lastRange)
	}
	review := body["needs_review"].([]any)[0].(map[string]any)
	if review["recurrence"].(map[string]any)["day_of_week"] != float64(2) || review["client_name"] != "利用者B" {
		t.Errorf("needs_review = %v", review)
	}
	skipped := body["skipped"].([]any)[0].(map[string]any)
	if skipped["date"] != "2026-11-03" || skipped["start_time"] != nil || skipped["reason"] != "all_day" {
		t.Errorf("skipped = %v", skipped)
	}
}

func TestCreateCalendarImport(t *testing.T) {
	f := &fakeCalendars{}
	rec, body := do(t, newCalendarRouter(f), http.MethodPost, "/v1/external_calendars/"+calendarID+"/imports",
		`{"range_start":"2026-11-01","range_end":"2026-11-30","decisions":[`+
			`{"external_event_id":"e1","revision":"r1","action":"patient","patient_id":"01M3TC66FGZVK39Y7GRVZSGWS1"},`+
			`{"external_event_id":"e2","revision":"r2","action":"skip"}]}`)
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body)
	}
	want := []calendar.Decision{
		{ExternalEventID: "e1", Action: calendar.ActionPatient, PatientID: "01M3TC66FGZVK39Y7GRVZSGWS1", Revision: "r1"},
		{ExternalEventID: "e2", Action: calendar.ActionSkip, Revision: "r2"},
	}
	if fmt.Sprint(f.lastDecisions) != fmt.Sprint(want) {
		t.Errorf("decisions = %+v", f.lastDecisions)
	}
	if body["imported_count"] != float64(2) || body["already_imported_count"] != float64(1) || body["status"] != "succeeded" {
		t.Errorf("body = %v", body)
	}
}

func TestCalendarExportIssues(t *testing.T) {
	rec, body := do(t, newCalendarRouter(&fakeCalendars{}), http.MethodGet, "/v1/facilities/"+facilityID+"/calendar_export_issues", "")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body)
	}
	items := body["items"].([]any)
	got := items[0].(map[string]any)
	want := map[string]any{
		"id": calendarID, "schedule_id": scheduleID, "recurring_schedule_id": nil, "status": "conflict", "error_code": "precondition_failed",
		"attempts": float64(1), "staff_id": staffID, "staff_name": "職員A", "date": "2026-11-04", "start_time": "10:00", "end_time": "11:00",
		"acceptable": true,
	}
	for k, v := range want {
		if got[k] != v {
			t.Errorf("%s = %v, want %v", k, got[k], v)
		}
	}

	rec, body = do(t, newCalendarRouter(&fakeCalendars{}), http.MethodPost, "/v1/calendar_exports/"+calendarID+"/retries", "")
	if rec.Code != http.StatusAccepted || body["status"] != "pending" || body["error_code"] != nil {
		t.Errorf("書き直し: status = %d, body = %v", rec.Code, body)
	}

	rec, body = do(t, newCalendarRouter(&fakeCalendars{}), http.MethodPost, "/v1/calendar_exports/"+calendarID+"/acceptances", "")
	if rec.Code != http.StatusOK || body["status"] != "succeeded" {
		t.Errorf("Google の内容で解く: status = %d, body = %v", rec.Code, body)
	}
}
