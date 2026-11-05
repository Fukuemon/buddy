package httpapi_test

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendar"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendarimport"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/schedule"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/scheduleview"
	"github.com/Fukuemon/buddy/services/schedule/internal/httpapi"
)

const calendarID = "01M3TD000000000000000000C0"

// fakeCalendars は、受け取った引数を記録し、err があればそれを返す。
type fakeCalendars struct {
	err           error
	lastRange     calendarimport.Range
	lastDecisions []calendarimport.Decision
	preview       calendarimport.ImportPreview
	lastFacility  string
	lastStaff     string
	// mine は、Mine が返すカレンダーである。
	mine *calendar.ExternalCalendar
	// incomplete は、CompleteCutover が返す満たさない一覧で、nil でなければ IncompleteError を返す。
	incomplete []calendarimport.Unmet
}

func (f *fakeCalendars) ServiceAccount(_ context.Context, facilityID string) (string, error) {
	f.lastFacility = facilityID
	return "buddy@example.iam.gserviceaccount.com", f.err
}

func (f *fakeCalendars) List(context.Context, string) ([]calendar.ExternalCalendar, error) {
	return []calendar.ExternalCalendar{{ID: calendarID, Provider: calendar.ProviderGoogle}}, f.err
}

func (f *fakeCalendars) Mine(_ context.Context, facilityID, staffID string) (*calendar.ExternalCalendar, error) {
	f.lastFacility, f.lastStaff = facilityID, staffID
	return f.mine, f.err
}

func (f *fakeCalendars) Check(_ context.Context, facilityID, _ string) error {
	f.lastFacility = facilityID
	return f.err
}

func (f *fakeCalendars) Link(_ context.Context, facilityID, staffID, calendarID string) (calendar.ExternalCalendar, error) {
	return calendar.ExternalCalendar{ID: calendarID, FacilityID: facilityID, StaffID: staffID, Provider: calendar.ProviderGoogle}, f.err
}

func (f *fakeCalendars) Unlink(context.Context, string) error { return f.err }

func (f *fakeCalendars) Preview(_ context.Context, _ string, rng calendarimport.Range) (calendarimport.ImportPreview, error) {
	f.lastRange = rng
	p := f.preview
	p.Range = rng
	return p, f.err
}

func (f *fakeCalendars) Import(_ context.Context, _ string, rng calendarimport.Range, decisions []calendarimport.Decision) (calendarimport.ImportResult, error) {
	f.lastRange, f.lastDecisions = rng, decisions
	return calendarimport.ImportResult{Run: calendar.ImportRun{ID: calendarID, ExternalCalendarID: calendarID, RangeStart: rng.Start, RangeEnd: rng.End, Status: calendar.RunSucceeded, ImportedCount: 2}, AlreadyImported: 1}, f.err
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

// app は、f のメソッド値を CalendarApp に入れる。
func (f *fakeCalendars) app() httpapi.CalendarApp {
	return httpapi.CalendarApp{
		ServiceAccount: f.ServiceAccount, List: f.List, Mine: f.Mine, Check: f.Check, Link: f.Link, Unlink: f.Unlink, Preview: f.Preview,
		Import: f.Import, ListExportIssues: f.ListExportIssues, RetryExport: f.RetryExport, AcceptExport: f.AcceptExport,
		GetCutover: f.GetCutover, StartCutover: f.StartCutover, CompleteCutover: f.CompleteCutover, CancelCutover: f.CancelCutover,
	}
}

func newCalendarRouter(c *fakeCalendars) http.Handler {
	return httpapi.NewRouter(httpapi.Apps{Calendars: c.app(), Auth: fakeAuth{}}, httpapi.RouterConfig{
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
		{name: "取り込みが進んでいる", err: apperr.ConflictCode(calendarimport.CodeImportRunning, "進んでいます"), method: http.MethodPost,
			target: "/v1/external_calendars/" + calendarID + "/imports", body: `{"range_start":"2026-11-01","range_end":"2026-11-30","decisions":[]}`,
			wantCode: http.StatusConflict, wantBody: "import_running"},
		{name: "確認が必要な書き出しでない", err: apperr.ConflictCode(calendar.CodeExportNotInReview, "確認が必要な書き出しではありません"), method: http.MethodPost,
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

// サービスアカウントとカレンダーの確認は、パスの事業所のアカウントで行う。
func TestGetMyExternalCalendar(t *testing.T) {
	f := &fakeCalendars{mine: &calendar.ExternalCalendar{ID: calendarID, FacilityID: facilityID, StaffID: staffID, Provider: calendar.ProviderGoogle}}
	rec, body := do(t, newCalendarRouter(f), http.MethodGet, "/v1/me/external_calendar", "")
	got, _ := body["external_calendar"].(map[string]any)
	if rec.Code != http.StatusOK || got["id"] != calendarID || f.lastFacility != facilityID || f.lastStaff != staffID {
		t.Errorf("結び付いた職員: status = %d, body = %s, facility = %q, staff = %q", rec.Code, rec.Body, f.lastFacility, f.lastStaff)
	}

	rec, body = do(t, newCalendarRouter(&fakeCalendars{}), http.MethodGet, "/v1/me/external_calendar", "")
	if v, ok := body["external_calendar"]; rec.Code != http.StatusOK || !ok || v != nil {
		t.Errorf("結び付いていない職員: status = %d, body = %s", rec.Code, rec.Body)
	}
}

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
	f := &fakeCalendars{preview: calendarimport.ImportPreview{
		Counts: calendarimport.Counts{Import: 1, ImportVisit: 1, NeedsReview: 1, Skipped: 1},
		ReviewItems: []calendarimport.ReviewItem{{
			ExternalEventID: "weekly", Date: d, StartTime: civil.Time{Hour: 10}, EndTime: civil.Time{Hour: 10, Minute: 30},
			Service: "訪看I2", Client: "利用者B", Reason: calendarimport.ReviewPatientAmbiguous,
			Recurrence: &schedule.Rule{Frequency: schedule.Weekly, DayOfWeek: &day},
			Candidates: []calendarimport.PatientRef{{ID: "PB1", Name: "利用者B", AssignedStaffName: "職員A"}},
		}},
		SkippedItems: []calendarimport.Skipped{{Date: &d, AllDay: true, Reason: calendar.SkipAllDay}},
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
	want := []calendarimport.Decision{
		{ExternalEventID: "e1", Action: calendarimport.ActionPatient, PatientID: "01M3TC66FGZVK39Y7GRVZSGWS1", Revision: "r1"},
		{ExternalEventID: "e2", Action: calendarimport.ActionSkip, Revision: "r2"},
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

const cutoverID = "01M3TD000000000000000000CT"

func testCutover(status calendarimport.CutoverStatus) calendarimport.Cutover {
	return calendarimport.Cutover{
		ID: cutoverID, FacilityID: facilityID, Status: status, RangeStart: civil.Date{Year: 2026, Month: 11, Day: 1},
		StartedBy: staffID, StartedAt: time.Date(2026, 11, 5, 0, 0, 0, 0, time.UTC),
	}
}

func (f *fakeCalendars) GetCutover(_ context.Context, facilityID string) (calendarimport.CutoverState, error) {
	f.lastFacility = facilityID
	c := testCutover(calendarimport.CutoverOpen)
	at := time.Date(2026, 11, 5, 1, 0, 0, 0, time.UTC)
	return calendarimport.CutoverState{Cutover: &c, Calendars: []calendarimport.CutoverCalendar{{
		Sync:       scheduleview.CalendarSync{ExternalCalendarID: calendarID, StaffID: staffID, StaffName: "職員A", LastStatus: scheduleview.SyncSucceeded, LastSucceededAt: &at},
		LastImport: &calendar.ImportRun{ID: calendarID, RangeStart: c.RangeStart, Status: calendar.RunSucceeded, CutoverID: &c.ID, StartedAt: at},
	}}}, f.err
}

func (f *fakeCalendars) StartCutover(_ context.Context, facilityID string) (calendarimport.Cutover, error) {
	f.lastFacility = facilityID
	return testCutover(calendarimport.CutoverOpen), f.err
}

func (f *fakeCalendars) CompleteCutover(context.Context, string) (calendarimport.Cutover, error) {
	if f.incomplete != nil {
		return calendarimport.Cutover{}, &calendarimport.IncompleteError{Items: f.incomplete}
	}
	return testCutover(calendarimport.CutoverCompleted), f.err
}

func (f *fakeCalendars) CancelCutover(context.Context, string) (calendarimport.Cutover, error) {
	return testCutover(calendarimport.CutoverCanceled), f.err
}

// TestCalendarCutover は、切り替えの 4 つの操作のレスポンスと、完了の確認を満たさないときの 409 の一覧を確認する。
func TestCalendarCutover(t *testing.T) {
	f := &fakeCalendars{}
	rec, body := do(t, newCalendarRouter(f), http.MethodGet, "/v1/facilities/"+facilityID+"/calendar_cutover_status", "")
	if rec.Code != http.StatusOK || f.lastFacility != facilityID {
		t.Fatalf("状況: status = %d, body = %s", rec.Code, rec.Body)
	}
	if c := body["cutover"].(map[string]any); c["status"] != "open" || c["range_start"] != "2026-11-01" || c["finished_at"] != nil {
		t.Errorf("cutover = %v", c)
	}
	cal := body["calendars"].([]any)[0].(map[string]any)
	if cal["staff_name"] != "職員A" || cal["last_status"] != "succeeded" || cal["last_import"].(map[string]any)["range_end"] != nil {
		t.Errorf("calendars = %v", cal)
	}

	rec, body = do(t, newCalendarRouter(f), http.MethodPost, "/v1/facilities/"+facilityID+"/calendar_cutovers", "")
	if rec.Code != http.StatusCreated || body["id"] != cutoverID {
		t.Errorf("始める: status = %d, body = %s", rec.Code, rec.Body)
	}
	rec, body = do(t, newCalendarRouter(f), http.MethodPost, "/v1/calendar_cutovers/"+cutoverID+"/completions", "")
	if rec.Code != http.StatusOK || body["status"] != "completed" {
		t.Errorf("完了: status = %d, body = %s", rec.Code, rec.Body)
	}
	rec, body = do(t, newCalendarRouter(f), http.MethodPost, "/v1/calendar_cutovers/"+cutoverID+"/cancel", "")
	if rec.Code != http.StatusOK || body["status"] != "canceled" {
		t.Errorf("やめる: status = %d, body = %s", rec.Code, rec.Body)
	}

	d, st, et := civil.Date{Year: 2026, Month: 11, Day: 10}, civil.Time{Hour: 10}, civil.Time{Hour: 10, Minute: 30}
	f = &fakeCalendars{incomplete: []calendarimport.Unmet{
		{ExternalCalendarID: calendarID, StaffID: staffID, StaffName: "職員A", Reason: calendarimport.UnmetSyncStale},
		{ExternalCalendarID: calendarID, StaffID: staffID, StaffName: "職員A", Reason: calendarimport.UnmetChanged, ExternalEventID: "e1", Date: &d, StartTime: &st, EndTime: &et},
		{ExternalCalendarID: calendarID, StaffID: staffID, StaffName: "職員A", Reason: calendarimport.UnmetNeedsReview, ExternalEventID: "e2", ReviewReason: calendarimport.ReviewRecurrenceUnsupported},
	}}
	rec, body = do(t, newCalendarRouter(f), http.MethodPost, "/v1/calendar_cutovers/"+cutoverID+"/completions", "")
	if rec.Code != http.StatusConflict || body["code"] != "cutover_incomplete" {
		t.Fatalf("完了の確認を満たさない: status = %d, body = %s", rec.Code, rec.Body)
	}
	items := body["items"].([]any)
	stale, changed, review := items[0].(map[string]any), items[1].(map[string]any), items[2].(map[string]any)
	if stale["reason"] != "sync_stale" || stale["external_event_id"] != nil || stale["date"] != nil {
		t.Errorf("同期が古い = %v", stale)
	}
	if changed["reason"] != "changed" || changed["date"] != "2026-11-10" || changed["start_time"] != "10:00" || changed["review_reason"] != nil {
		t.Errorf("変わった予定 = %v", changed)
	}
	if review["review_reason"] != "recurrence_unsupported" {
		t.Errorf("写せない繰り返し = %v", review)
	}

	for _, tt := range []struct {
		name, target string
		err          error
		want         string
	}{
		{"始める: open の切り替えがある", "/v1/facilities/" + facilityID + "/calendar_cutovers", apperr.ConflictCode(calendarimport.CodeCutoverOpen, "始めています"), "cutover_open"},
		{"完了: open でない", "/v1/calendar_cutovers/" + cutoverID + "/completions", apperr.ConflictCode(calendarimport.CodeCutoverNotOpen, "終えています"), "cutover_not_open"},
		{"やめる: open でない", "/v1/calendar_cutovers/" + cutoverID + "/cancel", apperr.ConflictCode(calendarimport.CodeCutoverNotOpen, "終えています"), "cutover_not_open"},
	} {
		rec, body := do(t, newCalendarRouter(&fakeCalendars{err: tt.err}), http.MethodPost, tt.target, "")
		if rec.Code != http.StatusConflict || body["code"] != tt.want {
			t.Errorf("%s: status = %d, body = %s", tt.name, rec.Code, rec.Body)
		}
	}
}

// TestCalendarImportOpenRange は、range_end を省くか null にした取り込みが、終わりを持たない期間（切り替えの取り込み）を操作に渡し、
// レスポンスの range_end を null で返すことを確認する。
func TestCalendarImportOpenRange(t *testing.T) {
	for _, body := range []string{`{"range_start":"2026-11-01"}`, `{"range_start":"2026-11-01","range_end":null}`} {
		f := &fakeCalendars{}
		rec, got := do(t, newCalendarRouter(f), http.MethodPost, "/v1/external_calendars/"+calendarID+"/import_previews", body)
		if rec.Code != http.StatusOK || f.lastRange.HasEnd() || got["range_end"] != nil {
			t.Errorf("%s: status = %d, range = %+v, body = %v", body, rec.Code, f.lastRange, got)
		}
	}
	f := &fakeCalendars{}
	rec, got := do(t, newCalendarRouter(f), http.MethodPost, "/v1/external_calendars/"+calendarID+"/imports", `{"range_start":"2026-11-01","decisions":[]}`)
	if rec.Code != http.StatusCreated || f.lastRange.HasEnd() || got["range_end"] != nil {
		t.Errorf("確定: status = %d, range = %+v, body = %v", rec.Code, f.lastRange, got)
	}
}
