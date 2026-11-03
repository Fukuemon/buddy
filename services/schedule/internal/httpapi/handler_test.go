package httpapi_test

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/patient"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/schedule"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/staff"
	"github.com/Fukuemon/buddy/services/schedule/internal/httpapi"
	"github.com/Fukuemon/buddy/services/schedule/internal/kernel"
	"github.com/Fukuemon/buddy/services/schedule/internal/principal"
)

const (
	facilityID = "01M3TC5H00QV17BC0J9V3393ZP"
	scheduleID = "01M3TC6BBRBQM0QK0S43P56AFH"
	staffID    = "01M3TC5TRG5200KYWTZW6ER3WN"
	typeID     = "01M3TC68E05E1N46YCCBT6ZQB2"
)

// fakeSchedules は、受け取った引数を記録し、err があればそれを返す。
type fakeSchedules struct {
	lastCtx   context.Context
	err       error
	listCalls int
	lastQuery schedule.ListQuery
	lastSlot  schedule.SlotInput
	detail    schedule.Detail
}

func (f *fakeSchedules) ListTypes(ctx context.Context) ([]schedule.Type, error) {
	f.lastCtx = ctx
	return nil, f.err
}

func (f *fakeSchedules) Get(ctx context.Context, _ string) (schedule.Detail, error) {
	f.lastCtx = ctx
	return f.detail, f.err
}

func (f *fakeSchedules) GetRecurring(context.Context, string) (schedule.RecurringDetail, error) {
	return schedule.RecurringDetail{}, f.err
}

func (f *fakeSchedules) List(_ context.Context, _ string, q schedule.ListQuery) (schedule.List, error) {
	f.listCalls++
	f.lastQuery = q
	return schedule.List{Schedules: []schedule.Detail{f.detail}, RecurringSchedules: []schedule.RecurringDetail{}}, f.err
}

func (f *fakeSchedules) Create(_ context.Context, _ string, in schedule.SlotInput) (schedule.Detail, error) {
	f.lastSlot = in
	return f.detail, f.err
}

func (f *fakeSchedules) CreateRecurring(context.Context, string, schedule.SlotInput, schedule.RuleInput) (schedule.RecurringDetail, error) {
	return schedule.RecurringDetail{}, f.err
}

func (f *fakeSchedules) ChangeOccurrence(context.Context, string, civil.Date, schedule.SlotInput) (schedule.Detail, error) {
	return f.detail, f.err
}

func (f *fakeSchedules) Cancel(context.Context, string, string) (schedule.Cancel, error) {
	return schedule.Cancel{}, f.err
}

func (f *fakeSchedules) Update(_ context.Context, _ string, in schedule.SlotInput) (schedule.Detail, error) {
	f.lastSlot = in
	return f.detail, f.err
}

type fakeStaff struct {
	listCalls        int
	lastQuery        staff.ListQuery
	lastPositionID   string
	lastGrant        staff.GrantInput
	lastUserPolicyID string
	lastProfile      staff.Profile
	lastCreate       staff.CreateInput
	lastStopped      string
	lastLeave        staff.LeaveInput
	assignments      staff.Assignments
	err              error
}

func (f *fakeStaff) Leave(_ context.Context, id string, in staff.LeaveInput) (staff.StatusChange, error) {
	f.lastStopped, f.lastLeave = id, in
	at := time.Date(2026, 10, 23, 9, 0, 0, 0, time.UTC)
	d := staff.Detail{Summary: staff.Summary{Staff: staff.Staff{ID: id, Email: "hina.aoki@example.com", LeaveStartedAt: &at, LeaveReturnDate: in.ReturnDate}}, Policies: []staff.PolicyGrant{}}
	return staff.StatusChange{Staff: d, Assignments: f.assignments}, f.err
}

func (f *fakeStaff) Reinstate(_ context.Context, id string) (staff.Detail, error) {
	f.lastStopped = id
	return staff.Detail{Summary: staff.Summary{Staff: staff.Staff{ID: id, Email: "hina.aoki@example.com"}}, Policies: []staff.PolicyGrant{}}, f.err
}

func (f *fakeStaff) Retire(_ context.Context, id string) (staff.StatusChange, error) {
	f.lastStopped = id
	at := time.Date(2026, 10, 23, 9, 0, 0, 0, time.UTC)
	d := staff.Detail{Summary: staff.Summary{Staff: staff.Staff{ID: id, RetiredAt: &at}}, Policies: []staff.PolicyGrant{}}
	return staff.StatusChange{Staff: d}, f.err
}

func (f *fakeStaff) AddGrant(_ context.Context, _ string, in staff.GrantInput) (staff.Detail, error) {
	f.lastGrant = in
	return staff.Detail{Summary: staff.Summary{Staff: staff.Staff{ID: staffID}}, Policies: []staff.PolicyGrant{}}, f.err
}

func (f *fakeStaff) RemoveGrant(_ context.Context, _, userPolicyID string) (staff.Detail, error) {
	f.lastUserPolicyID = userPolicyID
	return staff.Detail{Summary: staff.Summary{Staff: staff.Staff{ID: staffID}}, Policies: []staff.PolicyGrant{}}, f.err
}

func (f *fakeStaff) ChangePosition(_ context.Context, _, positionID string) (staff.Detail, error) {
	f.lastPositionID = positionID
	return staff.Detail{Summary: staff.Summary{Staff: staff.Staff{ID: staffID, PositionID: positionID}}, Policies: []staff.PolicyGrant{}}, f.err
}

func (f *fakeStaff) RemainingAssignments(_ context.Context, id string) (staff.Assignments, error) {
	f.lastStopped = id
	return f.assignments, f.err
}

func (f *fakeStaff) UpdateProfile(_ context.Context, id string, p staff.Profile) (staff.Detail, error) {
	f.lastProfile = p
	return staff.Detail{Summary: staff.Summary{Staff: staff.Staff{ID: id, Username: p.Username, PhoneNumber: p.PhoneNumber, DepartmentID: p.DepartmentID, TeamID: p.TeamID, NonVisiting: p.NonVisiting}}, Policies: []staff.PolicyGrant{}}, f.err
}

func (f *fakeStaff) Create(_ context.Context, in staff.CreateInput) (staff.Detail, error) {
	f.lastCreate = in
	return staff.Detail{Summary: staff.Summary{Staff: staff.Staff{NonVisiting: in.NonVisiting}}, Policies: []staff.PolicyGrant{}}, f.err
}

func (f *fakeStaff) Get(context.Context, string) (staff.Detail, error) { return staff.Detail{}, nil }

func (f *fakeStaff) List(_ context.Context, _ string, q staff.ListQuery) ([]staff.Summary, error) {
	f.listCalls++
	f.lastQuery = q
	return []staff.Summary{}, nil
}

type fakePatients struct {
	listCalls  int
	lastQuery  patient.ListQuery
	lastID     string
	lastUpdate patient.UpdateInput
	lastStaff  string
	remaining  patient.Remaining
	err        error
}

func (f *fakePatients) Get(_ context.Context, id string) (patient.Detail, error) {
	f.lastID = id
	at := time.Date(2026, 10, 31, 9, 0, 0, 0, time.UTC)
	return patient.Detail{Patient: patient.Patient{ID: id, Name: "見本 花子", PreferredTime: patient.Morning, PreferredGender: patient.Female, EndedAt: &at}}, f.err
}

func (f *fakePatients) RemainingSchedules(_ context.Context, id string) (patient.Remaining, error) {
	f.lastID = id
	return f.remaining, f.err
}

func (f *fakePatients) Create(context.Context, patient.CreateInput) (patient.Detail, error) {
	return patient.Detail{}, f.err
}

func (f *fakePatients) Update(_ context.Context, id string, in patient.UpdateInput) (patient.Detail, error) {
	f.lastID, f.lastUpdate = id, in
	return patient.Detail{Patient: patient.Patient{
		ID: id, Name: in.Name, PreferredTime: in.PreferredTime, PreferredGender: in.PreferredGender,
		ServiceCodeID: in.ServiceCodeID, AssignedStaffID: in.AssignedStaffID,
	}}, f.err
}

func (f *fakePatients) End(_ context.Context, id string) (patient.Detail, error) {
	f.lastID = id
	at := time.Date(2026, 10, 31, 9, 0, 0, 0, time.UTC)
	return patient.Detail{Patient: patient.Patient{ID: id, PreferredTime: patient.Morning, PreferredGender: patient.Female, EndedAt: &at}}, f.err
}

func (f *fakePatients) Resume(_ context.Context, id, assignedStaffID string) (patient.Detail, error) {
	f.lastID, f.lastStaff = id, assignedStaffID
	return patient.Detail{Patient: patient.Patient{ID: id, PreferredTime: patient.Morning, PreferredGender: patient.Female, AssignedStaffID: assignedStaffID}}, f.err
}

func (f *fakePatients) List(_ context.Context, _ string, q patient.ListQuery) ([]patient.Detail, error) {
	f.listCalls++
	f.lastQuery = q
	return []patient.Detail{}, nil
}

func newRouter(s *fakeSchedules, st *fakeStaff, p *fakePatients) http.Handler {
	return httpapi.NewRouter(httpapi.Usecases{Schedules: s, Staff: st, Patients: p, Auth: fakeAuth{}}, httpapi.RouterConfig{
		Logger:   slog.New(slog.NewTextHandler(io.Discard, nil)),
		Verifier: testVerifier,
	})
}

// do は、事業所 facilityID の職員のトークンを付けて h にリクエストを送る。
func do(t *testing.T, h http.Handler, method, target, body string) (*httptest.ResponseRecorder, map[string]any) {
	t.Helper()
	return doWithToken(t, h, method, target, body, token(t, testOrgID))
}

// doWithToken は、raw が空でなければ Bearer のトークンとして付けて h にリクエストを送る。
func doWithToken(t *testing.T, h http.Handler, method, target, body, raw string) (*httptest.ResponseRecorder, map[string]any) {
	t.Helper()
	req := httptest.NewRequest(method, target, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	if raw != "" {
		req.Header.Set("Authorization", "Bearer "+raw)
	}
	rec := serve(h, req)
	var got map[string]any
	if strings.HasPrefix(strings.TrimSpace(rec.Body.String()), "{") {
		if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
			t.Fatalf("decode %s: %v", rec.Body.String(), err)
		}
	}
	return rec, got
}

func serve(h http.Handler, req *http.Request) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func TestListSchedulesRejectsUnsafeSort(t *testing.T) {
	tests := []struct {
		name  string
		query string
	}{
		{name: "カラムに SQL を混ぜる", query: "sort_field=start_time;DROP"},
		{name: "カラムに句を足す", query: "sort_field=start_time%20DESC,%20(SELECT%201)"},
		{name: "許可していないカラム", query: "sort_field=staff_id"},
		{name: "向きに SQL を混ぜる", query: "sort_field=date&sort_order=desc;DROP"},
		{name: "未定義の種類", query: "schedule_type=x"},
		{name: "日付の形", query: "date_from=2026/10/01"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := &fakeSchedules{}
			rec, body := do(t, newRouter(s, nil, nil), http.MethodGet, "/v1/facilities/"+facilityID+"/schedules?"+tt.query, "")
			if rec.Code != http.StatusBadRequest {
				t.Fatalf("status = %d, body = %s", rec.Code, rec.Body)
			}
			if body["code"] != "invalid_input" {
				t.Errorf("body = %v", body)
			}
			if s.listCalls != 0 {
				t.Error("usecase が呼ばれた")
			}
		})
	}
}

func TestListSchedules(t *testing.T) {
	s := &fakeSchedules{detail: schedule.Detail{Schedule: schedule.Schedule{ID: scheduleID, Slot: schedule.Slot{
		Date: civil.Date{Year: 2026, Month: 10, Day: 20}, StartTime: civil.Time{Hour: 9}, EndTime: civil.Time{Hour: 10},
	}}}}
	rec, body := do(t, newRouter(s, nil, nil), http.MethodGet,
		"/v1/facilities/"+facilityID+"/schedules?sort_field=start_time&sort_order=desc&schedule_type=%E8%A8%AA%E5%95%8F&date_from=2026-10-01", "")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body)
	}
	if s.lastQuery.Sort != (kernel.Sort{Field: "start_time", Descending: true}) ||
		s.lastQuery.TypeName == nil || *s.lastQuery.TypeName != schedule.Visit ||
		s.lastQuery.DateFrom == nil || s.lastQuery.DateTo != nil {
		t.Errorf("query = %+v", s.lastQuery)
	}
	got := body["schedules"].([]any)[0].(map[string]any)
	for _, key := range []string{"title", "description", "visit_info", "cancel", "recurring_schedule_id"} {
		if v, ok := got[key]; !ok || v != nil {
			t.Errorf("%s = %v, want null", key, v)
		}
	}
	if got["date"] != "2026-10-20" || got["start_time"] != "09:00" {
		t.Errorf("date = %v, start_time = %v", got["date"], got["start_time"])
	}
	if rs, ok := body["recurring_schedules"].([]any); !ok || len(rs) != 0 {
		t.Errorf("recurring_schedules = %v", body["recurring_schedules"])
	}
}

func TestListUsersAndPatientsRejectUnsafeSort(t *testing.T) {
	st, p := &fakeStaff{}, &fakePatients{}
	h := newRouter(nil, st, p)
	for _, target := range []string{
		"/v1/facilities/" + facilityID + "/users?sort_field=username;DROP",
		"/v1/facilities/" + facilityID + "/users?sort_field=username&sort_order=asc,id",
		"/v1/facilities/" + facilityID + "/patients?sort_field=name;DROP",
	} {
		rec, _ := do(t, h, http.MethodGet, target, "")
		if rec.Code != http.StatusBadRequest {
			t.Errorf("%s: status = %d", target, rec.Code)
		}
	}
	if st.listCalls != 0 || p.listCalls != 0 {
		t.Error("usecase が呼ばれた")
	}
	rec, _ := do(t, h, http.MethodGet, "/v1/facilities/"+facilityID+"/users?sort_field=username&sort_order=asc", "")
	if rec.Code != http.StatusOK || st.lastQuery.Sort != (kernel.Sort{Field: "username"}) {
		t.Errorf("status = %d, query = %+v", rec.Code, st.lastQuery)
	}
}

func TestErrorStatus(t *testing.T) {
	tests := []struct {
		name     string
		err      error
		method   string
		target   string
		body     string
		wantCode int
		wantBody string
		wantMsg  string
	}{
		{name: "パスの ID が ULID でない", method: http.MethodGet, target: "/v1/schedules/not-a-ulid",
			wantCode: http.StatusBadRequest, wantBody: "invalid_input"},
		{name: "予定がない", err: apperr.ErrNotFound, method: http.MethodGet, target: "/v1/schedules/" + scheduleID,
			wantCode: http.StatusNotFound, wantBody: "not_found"},
		{name: "繰り返しの予定がない", err: apperr.ErrNotFound, method: http.MethodGet, target: "/v1/schedules/recurring/" + scheduleID,
			wantCode: http.StatusNotFound, wantBody: "not_found"},
		{name: "キャンセル済み", err: apperr.Conflict("この予定はすでにキャンセルされています"), method: http.MethodPost,
			target: "/v1/schedules/" + scheduleID + "/cancel", body: `{"reason":"体調不良"}`,
			wantCode: http.StatusConflict, wantBody: "conflict", wantMsg: "この予定はすでにキャンセルされています"},
		{name: "キャンセル済みの予定を変える", err: fmt.Errorf("update: %w", apperr.Conflict("キャンセル済みの予定は変えられません")),
			method: http.MethodPut, target: "/v1/schedules/" + scheduleID, body: validSlotBody,
			wantCode: http.StatusConflict, wantBody: "conflict", wantMsg: "キャンセル済みの予定は変えられません"},
		{name: "原因の文のない衝突", err: apperr.ErrConflict, method: http.MethodPut, target: "/v1/schedules/" + scheduleID,
			body: validSlotBody, wantCode: http.StatusConflict, wantBody: "conflict", wantMsg: "同じ内容のデータがすでにあります"},
		{name: "予定を見る権限がない", err: apperr.ErrForbidden, method: http.MethodGet, target: "/v1/schedules/" + scheduleID,
			wantCode: http.StatusForbidden, wantBody: "forbidden"},
		{name: "予定を作る権限がない", err: apperr.ErrForbidden, method: http.MethodPost, target: "/v1/facilities/" + facilityID + "/schedules",
			body: validSlotBody, wantCode: http.StatusForbidden, wantBody: "forbidden"},
		{name: "予定を変える権限がない", err: apperr.ErrForbidden, method: http.MethodPut, target: "/v1/schedules/" + scheduleID,
			body: validSlotBody, wantCode: http.StatusForbidden, wantBody: "forbidden"},
		{name: "予定をキャンセルする権限がない", err: apperr.ErrForbidden, method: http.MethodPost, target: "/v1/schedules/" + scheduleID + "/cancel",
			body: `{"reason":"体調不良"}`, wantCode: http.StatusForbidden, wantBody: "forbidden"},
		{name: "検証のエラー", err: apperr.Invalid("通常の予定にはタイトルが必須です"), method: http.MethodGet, target: "/v1/schedules/" + scheduleID,
			wantCode: http.StatusBadRequest, wantBody: "invalid_input"},
		{name: "想定外のエラー", err: errors.New("dial tcp: connection refused"), method: http.MethodGet, target: "/v1/schedules/" + scheduleID,
			wantCode: http.StatusInternalServerError, wantBody: "internal"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec, body := do(t, newRouter(&fakeSchedules{err: tt.err}, nil, nil), tt.method, tt.target, tt.body)
			if rec.Code != tt.wantCode {
				t.Fatalf("status = %d, body = %s", rec.Code, rec.Body)
			}
			if body["code"] != tt.wantBody {
				t.Errorf("body = %v", body)
			}
			if tt.wantMsg != "" && body["message"] != tt.wantMsg {
				t.Errorf("message = %v, want %q", body["message"], tt.wantMsg)
			}
			if strings.Contains(rec.Body.String(), "connection refused") {
				t.Error("内部のエラーの文を返した")
			}
		})
	}
}

// bodyErrorPrefixForTest は、本文を読めないときの 400 の文の先頭である（respond.go の bodyErrorPrefix）。
const bodyErrorPrefixForTest = "リクエストの本文が正しくありません: "

const validSlotBody = `{"schedule_type_id":"` + typeID + `","date":"2026-10-20","start_time":"09:00","end_time":"10:00",` +
	`"staff_id":"` + staffID + `","title":"会議"}`

func TestUpdateSchedule(t *testing.T) {
	s := &fakeSchedules{detail: schedule.Detail{Schedule: schedule.Schedule{ID: scheduleID}}}
	rec, body := do(t, newRouter(s, nil, nil), http.MethodPut, "/v1/schedules/"+scheduleID, validSlotBody)
	if rec.Code != http.StatusOK || body["id"] != scheduleID {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body)
	}
	if s.lastSlot.StaffID != staffID || s.lastSlot.Title == nil || *s.lastSlot.Title != "会議" {
		t.Errorf("slot = %+v", s.lastSlot)
	}
	rec, _ = do(t, newRouter(s, nil, nil), http.MethodPut, "/v1/schedules/"+scheduleID, `{"date":"2026-10-20"}`)
	if rec.Code != http.StatusBadRequest {
		t.Errorf("必須の項目がない本文: status = %d", rec.Code)
	}
}

func TestGetMe(t *testing.T) {
	rec, body := do(t, newRouter(nil, nil, nil), http.MethodGet, "/v1/me", "")
	if rec.Code != http.StatusOK || body["id"] != staffID || body["facility_id"] != facilityID {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body)
	}
	rec, _ = doWithToken(t, newRouter(nil, nil, nil), http.MethodGet, "/v1/me", "", "")
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("トークンなし: status = %d", rec.Code)
	}
}

func TestCreateSchedule(t *testing.T) {
	valid := validSlotBody
	tests := []struct {
		name        string
		body        string
		wantCode    int
		wantMessage string
	}{
		{name: "正しい本文", body: valid, wantCode: http.StatusCreated},
		{name: "必須の項目がない", body: `{"date":"2026-10-20","start_time":"09:00","end_time":"10:00"}`,
			wantCode: http.StatusBadRequest, wantMessage: "schedule_type_id"},
		{name: "日付の形", body: strings.Replace(valid, "2026-10-20", "20261020", 1), wantCode: http.StatusBadRequest},
		{name: "時刻の形", body: strings.Replace(valid, `"09:00"`, `"9時"`, 1), wantCode: http.StatusBadRequest},
		{name: "訪問の情報の区分が ULID でない", body: strings.Replace(valid, `"title":"会議"`,
			`"visit_info":{"patient_id":"`+staffID+`","assigned_staff_id":"`+staffID+`","service_code_id":"`+staffID+`","visit_category_ids":["x"]}`, 1),
			wantCode: http.StatusBadRequest, wantMessage: "visit_info.visit_category_ids[0]"},
		{name: "同行者が null", body: strings.Replace(valid, `"title":"会議"`,
			`"visit_info":{"patient_id":"`+staffID+`","assigned_staff_id":"`+staffID+`","companion_id":null,"service_code_id":"`+staffID+`"}`, 1),
			wantCode: http.StatusCreated},
		{name: "タイトルが長すぎる", body: strings.Replace(valid, `"title":"会議"`, `"title":"`+strings.Repeat("あ", 256)+`"`, 1),
			wantCode: http.StatusBadRequest, wantMessage: "title"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := &fakeSchedules{}
			rec, body := do(t, newRouter(s, nil, nil), http.MethodPost, "/v1/facilities/"+facilityID+"/schedules", tt.body)
			if rec.Code != tt.wantCode {
				t.Fatalf("status = %d, body = %s", rec.Code, rec.Body)
			}
			if msg, _ := body["message"].(string); !strings.Contains(msg, tt.wantMessage) {
				t.Errorf("message = %q, want %q を含む", msg, tt.wantMessage)
			}
			if tt.name == "正しい本文" &&
				(s.lastSlot.StartTime != civil.Time{Hour: 9} || s.lastSlot.Title == nil || s.lastSlot.Visit != nil) {
				t.Errorf("slot = %+v", s.lastSlot)
			}
		})
	}
}

func TestCreateScheduleEndsNextDay(t *testing.T) {
	overnight := strings.NewReplacer(`"09:00"`, `"22:00"`, `"10:00"`, `"01:00"`).Replace(validSlotBody)
	tests := []struct {
		name string
		body string
		want bool
	}{
		{name: "印を付ける", body: strings.Replace(overnight, `"title"`, `"ends_next_day":true,"title"`, 1), want: true},
		{name: "印を省く", body: overnight},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := &fakeSchedules{detail: schedule.Detail{Schedule: schedule.Schedule{ID: scheduleID, Slot: schedule.Slot{
				Date: civil.Date{Year: 2026, Month: 11, Day: 1}, StartTime: civil.Time{Hour: 22}, EndTime: civil.Time{Hour: 1}, EndsNextDay: tt.want,
			}}}}
			rec, body := do(t, newRouter(s, nil, nil), http.MethodPost, "/v1/facilities/"+facilityID+"/schedules", tt.body)
			if rec.Code != http.StatusCreated {
				t.Fatalf("status = %d, body = %s", rec.Code, rec.Body)
			}
			if s.lastSlot.EndsNextDay != tt.want || s.lastSlot.EndTime != (civil.Time{Hour: 1}) {
				t.Errorf("slot = %+v", s.lastSlot)
			}
			if body["ends_next_day"] != tt.want || body["date"] != "2026-11-01" || body["end_time"] != "01:00" {
				t.Errorf("ends_next_day = %v, date = %v, end_time = %v", body["ends_next_day"], body["date"], body["end_time"])
			}
		})
	}
}

func TestHealth(t *testing.T) {
	routerWithReady := func(err error) http.Handler {
		return httpapi.NewRouter(httpapi.Usecases{Auth: fakeAuth{}}, httpapi.RouterConfig{
			Logger:   slog.New(slog.NewTextHandler(io.Discard, nil)),
			Verifier: testVerifier,
			Ready:    func(context.Context) error { return err },
		})
	}
	tests := []struct {
		name       string
		h          http.Handler
		path       string
		wantCode   int
		wantStatus string
	}{
		{"healthz は依存先を確認しない", routerWithReady(errors.New("down")), "/healthz", http.StatusOK, "ok"},
		{"readyz は依存先に届けば 200", routerWithReady(nil), "/readyz", http.StatusOK, "ok"},
		{"readyz は依存先に届かなければ 503", routerWithReady(errors.New("down")), "/readyz", http.StatusServiceUnavailable, "unavailable"},
		{"Ready が nil の readyz は 200", newRouter(nil, nil, nil), "/readyz", http.StatusOK, "ok"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec, body := doWithToken(t, tt.h, http.MethodGet, tt.path, "", "")
			if rec.Code != tt.wantCode || body["status"] != tt.wantStatus {
				t.Fatalf("status = %d, body = %v", rec.Code, body)
			}
		})
	}
}

func TestGetUserRemainingAssignments(t *testing.T) {
	st := &fakeStaff{assignments: staff.Assignments{
		Schedules: []staff.AssignedSchedule{{ID: "01M3TC5H00QV17BC0J9V3393ZP", Date: civil.Date{Year: 2026, Month: 11, Day: 2},
			StartTime: civil.Time{Hour: 9}, EndTime: civil.Time{Hour: 10}}},
		Patients: []staff.AssignedPatient{{ID: "01M3TC5H00QV17BC0J9V3393ZQ", Name: "山田 花子"}},
	}}
	rec, body := do(t, newRouter(&fakeSchedules{}, st, &fakePatients{}), http.MethodGet, "/v1/users/"+staffID+"/remaining_assignments", "")
	if rec.Code != http.StatusOK || st.lastStopped != staffID {
		t.Fatalf("status = %d, 職員 = %s, body = %v", rec.Code, st.lastStopped, body)
	}
	scheds, recs, pats := body["schedules"].([]any), body["recurring_schedules"].([]any), body["patients"].([]any)
	if len(scheds) != 1 || scheds[0].(map[string]any)["date"] != "2026-11-02" || len(recs) != 0 || len(pats) != 1 {
		t.Errorf("body = %v, want 予定 1 件と利用者 1 人と空の繰り返し", body)
	}
	forbidden := newRouter(&fakeSchedules{}, &fakeStaff{err: apperr.ErrForbidden}, &fakePatients{})
	if rec, body := do(t, forbidden, http.MethodGet, "/v1/users/"+staffID+"/remaining_assignments", ""); rec.Code != http.StatusForbidden || body["code"] != "forbidden" {
		t.Errorf("職員の管理の権限が無い: status = %d, body = %v", rec.Code, body)
	}
}

// 休職は、職員の状態と戻る予定の日と、残る予定と担当の利用者の一覧を返す（#268 の検証の観点 1）。
func TestStartUserLeave(t *testing.T) {
	st := &fakeStaff{assignments: staff.Assignments{
		Schedules: []staff.AssignedSchedule{{ID: "01M3TC5H00QV17BC0J9V3393ZP", Date: civil.Date{Year: 2026, Month: 11, Day: 2},
			StartTime: civil.Time{Hour: 9}, EndTime: civil.Time{Hour: 10}}},
		Patients: []staff.AssignedPatient{{ID: "01M3TC5H00QV17BC0J9V3393ZQ", Name: "山田 花子"}},
	}}
	rec, body := do(t, newRouter(&fakeSchedules{}, st, &fakePatients{}), http.MethodPost, "/v1/users/"+staffID+"/leave", `{"return_date":"2027-04-01"}`)
	if rec.Code != http.StatusOK || st.lastStopped != staffID || st.lastLeave.ReturnDate == nil || st.lastLeave.ReturnDate.String() != "2027-04-01" {
		t.Fatalf("status = %d, 休職にした職員 = %s, 入力 = %+v, body = %v", rec.Code, st.lastStopped, st.lastLeave, body)
	}
	got := body["staff"].(map[string]any)
	if got["status"] != "on_leave" || got["leave_started_at"] != "2026-10-23T09:00:00Z" || got["leave_return_date"] != "2027-04-01" || got["retired_at"] != nil {
		t.Errorf("staff = %v, want 休職と戻る予定の日", got)
	}
	a := body["assignments"].(map[string]any)
	scheds, recs, pats := a["schedules"].([]any), a["recurring_schedules"].([]any), a["patients"].([]any)
	if len(scheds) != 1 || scheds[0].(map[string]any)["start_time"] != "09:00" || len(recs) != 0 || len(pats) != 1 || pats[0].(map[string]any)["name"] != "山田 花子" {
		t.Errorf("assignments = %v, want 予定 1 件と利用者 1 人と空の繰り返し", a)
	}

	rec, _ = do(t, newRouter(&fakeSchedules{}, &fakeStaff{}, &fakePatients{}), http.MethodPost, "/v1/users/"+staffID+"/leave", `{}`)
	if rec.Code != http.StatusOK {
		t.Errorf("戻る予定の日なし: status = %d, want 200", rec.Code)
	}
	rec, _ = do(t, newRouter(&fakeSchedules{}, &fakeStaff{}, &fakePatients{}), http.MethodPost, "/v1/users/"+staffID+"/leave", `{"return_date":"2027-13-01"}`)
	if rec.Code != http.StatusBadRequest {
		t.Errorf("日付でない戻る予定の日: status = %d, want 400", rec.Code)
	}
	rec, _ = do(t, newRouter(&fakeSchedules{}, &fakeStaff{err: apperr.ErrForbidden}, &fakePatients{}), http.MethodPost, "/v1/users/"+staffID+"/leave", `{}`)
	if rec.Code != http.StatusForbidden {
		t.Errorf("権限なし: status = %d, want 403", rec.Code)
	}
	rec, body = do(t, newRouter(&fakeSchedules{}, &fakeStaff{err: apperr.Conflict("自分を休職か退職にすることはできません")}, &fakePatients{}), http.MethodPost, "/v1/users/"+staffID+"/leave", `{}`)
	if rec.Code != http.StatusConflict || body["code"] != "conflict" {
		t.Errorf("自分: status = %d, body = %v, want 409 conflict", rec.Code, body)
	}
}

func TestReinstateUser(t *testing.T) {
	st := &fakeStaff{}
	rec, body := do(t, newRouter(&fakeSchedules{}, st, &fakePatients{}), http.MethodPost, "/v1/users/"+staffID+"/reinstate", "")
	if rec.Code != http.StatusOK || st.lastStopped != staffID || body["status"] != "active" || body["leave_started_at"] != nil {
		t.Fatalf("status = %d, 復職にした職員 = %s, body = %v", rec.Code, st.lastStopped, body)
	}
	rec, _ = do(t, newRouter(&fakeSchedules{}, &fakeStaff{err: apperr.Conflict("退職した職員は復職できません")}, &fakePatients{}), http.MethodPost, "/v1/users/"+staffID+"/reinstate", "")
	if rec.Code != http.StatusConflict {
		t.Errorf("退職した職員: status = %d, want 409", rec.Code)
	}
}

// 退職は、退職した職員のメールと電話番号を null で返す。予定か担当の利用者が残れば、409 で残る一覧を返す（#268 の検証の観点 3、4）。
func TestRetireUser(t *testing.T) {
	st := &fakeStaff{}
	rec, body := do(t, newRouter(&fakeSchedules{}, st, &fakePatients{}), http.MethodPost, "/v1/users/"+staffID+"/retire", "")
	got, _ := body["staff"].(map[string]any)
	if rec.Code != http.StatusOK || st.lastStopped != staffID || got["status"] != "retired" || got["email"] != nil || got["phone_number"] != nil {
		t.Fatalf("status = %d, 退職にした職員 = %s, body = %v", rec.Code, st.lastStopped, body)
	}

	assigned := &staff.AssignedError{Assignments: staff.Assignments{
		RecurringSchedules: []staff.AssignedRecurring{{ID: "01M3TC5H00QV17BC0J9V3393ZP", Date: civil.Date{Year: 2026, Month: 10, Day: 5},
			StartTime: civil.Time{Hour: 13}, EndTime: civil.Time{Hour: 14}}},
	}}
	rec, body = do(t, newRouter(&fakeSchedules{}, &fakeStaff{err: assigned}, &fakePatients{}), http.MethodPost, "/v1/users/"+staffID+"/retire", "")
	if rec.Code != http.StatusConflict || body["code"] != "staff_has_assignments" {
		t.Fatalf("残る予定: status = %d, body = %v, want 409 staff_has_assignments", rec.Code, body)
	}
	a := body["assignments"].(map[string]any)
	recs := a["recurring_schedules"].([]any)
	if len(recs) != 1 || recs[0].(map[string]any)["end_date"] != nil || len(a["schedules"].([]any)) != 0 || len(a["patients"].([]any)) != 0 {
		t.Errorf("assignments = %v, want 終了日の無い繰り返し 1 件", a)
	}

	rec, body = do(t, newRouter(&fakeSchedules{}, &fakeStaff{err: apperr.Conflict("職員の管理の権限を持つ最後の有効な職員は、休職と退職にできません")}, &fakePatients{}), http.MethodPost, "/v1/users/"+staffID+"/retire", "")
	if rec.Code != http.StatusConflict || body["code"] != "conflict" || body["assignments"] != nil {
		t.Errorf("最後の管理者: status = %d, body = %v, want 一覧の無い 409 conflict", rec.Code, body)
	}
}

const patientID = "01M3TC5H00QV17BC0J9V3393ZQ"

// 利用者の一覧は、デフォルトで利用中の利用者だけを、include_ended=true なら利用の終了の利用者も返す（#346 の検証の観点 3）。
func TestListPatientsIncludeEnded(t *testing.T) {
	p := &fakePatients{}
	h := newRouter(nil, &fakeStaff{}, p)
	for target, want := range map[string]bool{
		"/v1/facilities/" + facilityID + "/patients":                     false,
		"/v1/facilities/" + facilityID + "/patients?include_ended=false": false,
		"/v1/facilities/" + facilityID + "/patients?include_ended=true":  true,
	} {
		rec, _ := do(t, h, http.MethodGet, target, "")
		if rec.Code != http.StatusOK || p.lastQuery.IncludeEnded != want {
			t.Errorf("%s: status = %d, IncludeEnded = %v, want %v", target, rec.Code, p.lastQuery.IncludeEnded, want)
		}
	}
	rec, _ := do(t, h, http.MethodGet, "/v1/facilities/"+facilityID+"/patients?include_ended=yes", "")
	if rec.Code != http.StatusBadRequest {
		t.Errorf("真偽値でない include_ended: status = %d, want 400", rec.Code)
	}
}

const patientBody = `{"name":"見本 花子","preferred_time":"午後","preferred_gender":"女性","service_code_id":"` + typeID + `","assigned_staff_id":"` + staffID + `"}`

// 利用者の変更は、本文の値を usecase に渡し、変えた利用者を返す。入力のエラーは 400、権限が無ければ 403 を返す（#346 の検証の観点 1、2、5）。
func TestUpdatePatient(t *testing.T) {
	p := &fakePatients{}
	rec, body := do(t, newRouter(nil, &fakeStaff{}, p), http.MethodPut, "/v1/patients/"+patientID, patientBody)
	want := patient.UpdateInput{Name: "見本 花子", PreferredTime: patient.Afternoon, PreferredGender: patient.Female, ServiceCodeID: typeID, AssignedStaffID: staffID}
	if rec.Code != http.StatusOK || p.lastID != patientID || p.lastUpdate != want || body["name"] != "見本 花子" || body["ended_at"] != nil {
		t.Fatalf("status = %d, id = %s, 入力 = %+v, body = %v", rec.Code, p.lastID, p.lastUpdate, body)
	}
	rec, body = do(t, newRouter(nil, &fakeStaff{}, &fakePatients{err: apperr.Invalid("休職の職員 %s には、予定と担当を割り振れません", staffID)}),
		http.MethodPut, "/v1/patients/"+patientID, patientBody)
	if rec.Code != http.StatusBadRequest || body["code"] != "invalid_input" {
		t.Errorf("休職の担当: status = %d, body = %v, want 400", rec.Code, body)
	}
	rec, _ = do(t, newRouter(nil, &fakeStaff{}, &fakePatients{err: apperr.ErrForbidden}), http.MethodPut, "/v1/patients/"+patientID, patientBody)
	if rec.Code != http.StatusForbidden {
		t.Errorf("権限なし: status = %d, want 403", rec.Code)
	}
}

// 利用の終了は、利用の終了にした時刻を返す。その日以降の予定が残れば、409 で残る一覧を返す（#346 の検証の観点 3）。
func TestEndPatientService(t *testing.T) {
	p := &fakePatients{}
	rec, body := do(t, newRouter(nil, &fakeStaff{}, p), http.MethodPost, "/v1/patients/"+patientID+"/end_service", "")
	if rec.Code != http.StatusOK || p.lastID != patientID || body["ended_at"] != "2026-10-31T09:00:00Z" {
		t.Fatalf("status = %d, id = %s, body = %v", rec.Code, p.lastID, body)
	}

	scheduled := &patient.ScheduledError{Remaining: patient.Remaining{
		Schedules: []patient.RemainingSchedule{{ID: scheduleID, Date: civil.Date{Year: 2026, Month: 11, Day: 2}, StartTime: civil.Time{Hour: 9}, EndTime: civil.Time{Hour: 10}}},
	}}
	rec, body = do(t, newRouter(nil, &fakeStaff{}, &fakePatients{err: scheduled}), http.MethodPost, "/v1/patients/"+patientID+"/end_service", "")
	if rec.Code != http.StatusConflict || body["code"] != "patient_has_schedules" {
		t.Fatalf("残る予定: status = %d, body = %v, want 409 patient_has_schedules", rec.Code, body)
	}
	r := body["schedules"].(map[string]any)
	scheds := r["schedules"].([]any)
	if len(scheds) != 1 || scheds[0].(map[string]any)["date"] != "2026-11-02" || len(r["recurring_schedules"].([]any)) != 0 {
		t.Errorf("schedules = %v, want 予定 1 件と空の繰り返し", r)
	}
}

// 利用者を 1 人読むと、利用の終了の利用者も、利用の終了にした時刻と一緒に返る。権限が無ければ 403 を返す（#353 の検証の観点 1、3）。
func TestGetPatient(t *testing.T) {
	p := &fakePatients{}
	rec, body := do(t, newRouter(nil, &fakeStaff{}, p), http.MethodGet, "/v1/patients/"+patientID, "")
	if rec.Code != http.StatusOK || p.lastID != patientID || body["name"] != "見本 花子" || body["ended_at"] != "2026-10-31T09:00:00Z" {
		t.Fatalf("status = %d, id = %s, body = %v", rec.Code, p.lastID, body)
	}
	rec, body = do(t, newRouter(nil, &fakeStaff{}, &fakePatients{err: apperr.ErrForbidden}), http.MethodGet, "/v1/patients/"+patientID, "")
	if rec.Code != http.StatusForbidden || body["code"] != "forbidden" {
		t.Errorf("権限なし: status = %d, body = %v, want 403", rec.Code, body)
	}
	rec, _ = do(t, newRouter(nil, &fakeStaff{}, &fakePatients{err: apperr.ErrNotFound}), http.MethodGet, "/v1/patients/"+patientID, "")
	if rec.Code != http.StatusNotFound {
		t.Errorf("いない利用者: status = %d, want 404", rec.Code)
	}
}

// 利用者に残る予定は、利用の終了の 409 の schedules と同じ形で返る。権限が無ければ 403 を返す（#353 の検証の観点 2、3）。
func TestGetPatientRemainingSchedules(t *testing.T) {
	rem := patient.Remaining{
		Schedules:          []patient.RemainingSchedule{{ID: scheduleID, Date: civil.Date{Year: 2026, Month: 11, Day: 2}, StartTime: civil.Time{Hour: 9}, EndTime: civil.Time{Hour: 10}}},
		RecurringSchedules: []patient.RemainingRecurring{{ID: patientID, Date: civil.Date{Year: 2026, Month: 9, Day: 1}, StartTime: civil.Time{Hour: 13}, EndTime: civil.Time{Hour: 14}}},
	}
	p := &fakePatients{remaining: rem}
	rec, body := do(t, newRouter(nil, &fakeStaff{}, p), http.MethodGet, "/v1/patients/"+patientID+"/remaining_schedules", "")
	if rec.Code != http.StatusOK || p.lastID != patientID {
		t.Fatalf("status = %d, id = %s, body = %v", rec.Code, p.lastID, body)
	}
	_, conflict := do(t, newRouter(nil, &fakeStaff{}, &fakePatients{err: &patient.ScheduledError{Remaining: rem}}), http.MethodPost, "/v1/patients/"+patientID+"/end_service", "")
	if !reflect.DeepEqual(body, conflict["schedules"]) {
		t.Errorf("body = %v, want 利用の終了の 409 の schedules（%v）と同じ", body, conflict["schedules"])
	}
	rec, body = do(t, newRouter(nil, &fakeStaff{}, &fakePatients{err: apperr.ErrForbidden}), http.MethodGet, "/v1/patients/"+patientID+"/remaining_schedules", "")
	if rec.Code != http.StatusForbidden || body["code"] != "forbidden" {
		t.Errorf("権限なし: status = %d, body = %v, want 403", rec.Code, body)
	}
}

// 利用の再開は、本文の担当の職員を usecase に渡す。担当の職員を省くと 400 を返す（ADR-0021）。
func TestResumePatientService(t *testing.T) {
	p := &fakePatients{}
	rec, body := do(t, newRouter(nil, &fakeStaff{}, p), http.MethodPost, "/v1/patients/"+patientID+"/resume_service", `{"assigned_staff_id":"`+staffID+`"}`)
	if rec.Code != http.StatusOK || p.lastID != patientID || p.lastStaff != staffID || body["assigned_staff_id"] != staffID || body["ended_at"] != nil {
		t.Fatalf("status = %d, id = %s, 担当 = %s, body = %v", rec.Code, p.lastID, p.lastStaff, body)
	}
	p = &fakePatients{}
	rec, _ = do(t, newRouter(nil, &fakeStaff{}, p), http.MethodPost, "/v1/patients/"+patientID+"/resume_service", `{}`)
	if rec.Code != http.StatusBadRequest || p.lastID != "" {
		t.Errorf("担当なし: status = %d, usecase = %q, want 400 で usecase を呼ばない", rec.Code, p.lastID)
	}
}

func TestChangeUserPosition(t *testing.T) {
	const positionID = "01M3TC5PVG7W2H1H20W0T1ZVEJ"
	st := &fakeStaff{}
	rec, body := do(t, newRouter(&fakeSchedules{}, st, &fakePatients{}), http.MethodPut,
		"/v1/users/"+staffID+"/position", `{"position_id":"`+positionID+`"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body)
	}
	if st.lastPositionID != positionID || body["position"].(map[string]any)["id"] != positionID {
		t.Errorf("役職 = %s, body = %v", st.lastPositionID, body)
	}
	rec, _ = do(t, newRouter(&fakeSchedules{}, st, &fakePatients{}), http.MethodPut, "/v1/users/"+staffID+"/position", `{}`)
	if rec.Code != http.StatusBadRequest {
		t.Errorf("position_id が無い: status = %d", rec.Code)
	}
	last := newRouter(&fakeSchedules{}, &fakeStaff{err: apperr.Conflict("職員の管理の権限を持つ最後の有効な職員の役職は、その権限を持たない役職に変えられません")}, &fakePatients{})
	if rec, body := do(t, last, http.MethodPut, "/v1/users/"+staffID+"/position", `{"position_id":"`+positionID+`"}`); rec.Code != http.StatusConflict || body["code"] != "conflict" {
		t.Errorf("最後の管理者: status = %d, body = %v, want 409 conflict", rec.Code, body)
	}
}

func TestUpdateUser(t *testing.T) {
	const depID, teamID = "01M3TC5HZ8A18D2TP3PTKDXJMN", "01M3TC5MX04QJ19X6XR1ZCBZRJ"
	st := &fakeStaff{}
	h := newRouter(&fakeSchedules{}, st, &fakePatients{})
	rec, body := do(t, h, http.MethodPut, "/v1/users/"+staffID,
		`{"username":"青木 ひな","phone_number":"09012345678","department_id":"`+depID+`","team_id":"`+teamID+`","visits":true}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body)
	}
	p := st.lastProfile
	if p.Username != "青木 ひな" || p.PhoneNumber == nil || *p.PhoneNumber != "09012345678" || p.DepartmentID != depID || p.TeamID != teamID {
		t.Errorf("入力 = %+v", p)
	}
	if body["username"] != "青木 ひな" || body["team"].(map[string]any)["id"] != teamID {
		t.Errorf("body = %v", body)
	}
	if rec, _ := do(t, h, http.MethodPut, "/v1/users/"+staffID, `{"username":"青木","department_id":"`+depID+`","team_id":"`+teamID+`","visits":true}`); rec.Code != http.StatusOK || st.lastProfile.PhoneNumber != nil {
		t.Errorf("電話番号を省く: status = %d, 電話番号 = %v, want 200 で nil", rec.Code, st.lastProfile.PhoneNumber)
	}
	for name, b := range map[string]string{
		"名前が無い":         `{"department_id":"` + depID + `","team_id":"` + teamID + `","visits":true}`,
		"チームの ID の形が誤り": `{"username":"青木","department_id":"` + depID + `","team_id":"x","visits":true}`,
		"訪問するかが無い":      `{"username":"青木","department_id":"` + depID + `","team_id":"` + teamID + `"}`,
	} {
		if rec, _ := do(t, h, http.MethodPut, "/v1/users/"+staffID, b); rec.Code != http.StatusBadRequest {
			t.Errorf("%s: status = %d", name, rec.Code)
		}
	}
	valid := `{"username":"青木","department_id":"` + depID + `","team_id":"` + teamID + `","visits":true}`
	for name, c := range map[string]struct {
		err    error
		status int
		code   string
	}{
		"ほかの事業所のチーム":  {apperr.Invalid("チーム %s はこの事業所に属していません", teamID), http.StatusBadRequest, "invalid_input"},
		"職員の管理の権限が無い": {apperr.ErrForbidden, http.StatusForbidden, "forbidden"},
		"退職した職員":      {apperr.Conflict("退職した職員は変えられません"), http.StatusConflict, "conflict"},
	} {
		h := newRouter(&fakeSchedules{}, &fakeStaff{err: c.err}, &fakePatients{})
		if rec, body := do(t, h, http.MethodPut, "/v1/users/"+staffID, valid); rec.Code != c.status || body["code"] != c.code {
			t.Errorf("%s: status = %d, body = %v, want %d %s", name, rec.Code, body, c.status, c.code)
		}
	}
}

func TestAddUserPolicy(t *testing.T) {
	const policyID, targetID = "01M5E1S42TTS7QZK05YGS0GYR9", "01M3TC5VQR3MKFF9AA4BVKF44Z"
	st := &fakeStaff{}
	h := newRouter(&fakeSchedules{}, st, &fakePatients{})
	rec, _ := do(t, h, http.MethodPost, "/v1/users/"+staffID+"/policies",
		`{"policy_id":"`+policyID+`","target_user_ids":["`+targetID+`"]}`)
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body)
	}
	if st.lastGrant.PolicyID != policyID || len(st.lastGrant.TargetUserIDs) != 1 || st.lastGrant.TargetUserIDs[0] != targetID {
		t.Errorf("入力 = %+v", st.lastGrant)
	}
	for name, body := range map[string]string{
		"policy_id が無い": `{}`,
		"対象の ID の形が誤り":  `{"policy_id":"` + policyID + `","target_team_ids":["x"]}`,
	} {
		if rec, _ := do(t, h, http.MethodPost, "/v1/users/"+staffID+"/policies", body); rec.Code != http.StatusBadRequest {
			t.Errorf("%s: status = %d", name, rec.Code)
		}
	}
	forbidden := newRouter(&fakeSchedules{}, &fakeStaff{err: apperr.ErrForbidden}, &fakePatients{})
	if rec, body := do(t, forbidden, http.MethodPost, "/v1/users/"+staffID+"/policies", `{"policy_id":"`+policyID+`"}`); rec.Code != http.StatusForbidden || body["code"] != "forbidden" {
		t.Errorf("職員の管理の権限が無い: status = %d, body = %v", rec.Code, body)
	}
}

func TestRemoveUserPolicy(t *testing.T) {
	const userPolicyID = "01M5E1V0KR0WQZ6M3B1C4D5E6K"
	st := &fakeStaff{}
	rec, _ := do(t, newRouter(&fakeSchedules{}, st, &fakePatients{}), http.MethodDelete, "/v1/users/"+staffID+"/policies/"+userPolicyID, "")
	if rec.Code != http.StatusOK || st.lastUserPolicyID != userPolicyID {
		t.Fatalf("status = %d, 外した権限 = %s", rec.Code, st.lastUserPolicyID)
	}
	notFound := newRouter(&fakeSchedules{}, &fakeStaff{err: apperr.ErrNotFound}, &fakePatients{})
	if rec, _ := do(t, notFound, http.MethodDelete, "/v1/users/"+staffID+"/policies/"+userPolicyID, ""); rec.Code != http.StatusNotFound {
		t.Errorf("職員の権限が無い: status = %d", rec.Code)
	}
	last := newRouter(&fakeSchedules{}, &fakeStaff{err: apperr.Conflict("職員の管理の権限を持つ最後の有効な職員から、その権限は外せません")}, &fakePatients{})
	if rec, body := do(t, last, http.MethodDelete, "/v1/users/"+staffID+"/policies/"+userPolicyID, ""); rec.Code != http.StatusConflict || body["code"] != "conflict" {
		t.Errorf("最後の管理者: status = %d, body = %v, want 409 conflict", rec.Code, body)
	}
}

// TestUsecaseReceivesPrincipal は、操作が権限を判定できるよう、認証のミドルウェアが特定した職員を ctx で渡すことを確認する。
func TestUsecaseReceivesPrincipal(t *testing.T) {
	s := &fakeSchedules{}
	do(t, newRouter(s, &fakeStaff{}, &fakePatients{}), http.MethodGet, "/v1/schedules/"+scheduleID, "")
	if s.lastCtx == nil {
		t.Fatal("usecase が呼ばれなかった")
	}
	if p, ok := principal.From(s.lastCtx); !ok || p.Staff.ID != staffID {
		t.Fatalf("usecase の ctx の職員 = %+v, %v", p, ok)
	}
}

func TestUsecaseReceivesRequestCancellation(t *testing.T) {
	s := &fakeSchedules{}
	h := newRouter(s, &fakeStaff{}, &fakePatients{})
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	req := httptest.NewRequest(http.MethodGet, "/v1/schedule_types", nil).WithContext(ctx)
	req.Header.Set("Authorization", "Bearer "+token(t, testOrgID))
	serve(h, req)
	if s.lastCtx == nil {
		t.Fatal("usecase が呼ばれなかった")
	}
	if !errors.Is(s.lastCtx.Err(), context.Canceled) {
		t.Fatalf("usecase の context がリクエストの取り消しを受けない: %v", s.lastCtx.Err())
	}
}

// TestCORSPreflight は、許した origin からのプリフライトのリクエストに、API が使う全てのメソッドを許すことを確認する。
func TestCORSPreflight(t *testing.T) {
	const origin = "http://localhost:3000"
	h := httpapi.NewRouter(httpapi.Usecases{Auth: fakeAuth{}}, httpapi.RouterConfig{
		Logger:       slog.New(slog.NewTextHandler(io.Discard, nil)),
		Verifier:     testVerifier,
		AllowOrigins: []string{origin},
	})
	for _, method := range []string{http.MethodGet, http.MethodPost, http.MethodPut, http.MethodDelete} {
		req := httptest.NewRequest(http.MethodOptions, "/v1/users/"+staffID+"/policies/"+scheduleID, nil)
		req.Header.Set("Origin", origin)
		req.Header.Set("Access-Control-Request-Method", method)
		rec := serve(h, req)
		if rec.Code >= 300 || !strings.Contains(rec.Header().Get("Access-Control-Allow-Methods"), method) {
			t.Errorf("%s: status = %d, Allow-Methods = %q", method, rec.Code, rec.Header().Get("Access-Control-Allow-Methods"))
		}
	}
}

// TestCreateForbidden は、職員の管理の権限が無いときに、職員と利用者の登録が 403 になることを確認する。
func TestCreateForbidden(t *testing.T) {
	h := newRouter(&fakeSchedules{}, &fakeStaff{err: apperr.ErrForbidden}, &fakePatients{err: apperr.ErrForbidden})
	for target, body := range map[string]string{
		"/v1/facilities/" + facilityID + "/users": `{"username":"新人","email":"new@example.com","department_id":"` + staffID +
			`","team_id":"` + staffID + `","position_id":"` + staffID + `"}`,
		"/v1/facilities/" + facilityID + "/patients": `{"name":"見本","preferred_time":"午前","preferred_gender":"男性","service_code_id":"` + staffID +
			`","assigned_staff_id":"` + staffID + `"}`,
	} {
		if rec, got := do(t, h, http.MethodPost, target, body); rec.Code != http.StatusForbidden || got["code"] != "forbidden" {
			t.Errorf("%s: status = %d, body = %v", target, rec.Code, got)
		}
	}
}

// TestRequestConstraints は、openapi.yaml に書いた本文の制約で、handler を呼ぶ前に 400 を返すことを確認する。
func TestRequestConstraints(t *testing.T) {
	user := `{"username":"新人","email":"new@example.com","department_id":"` + staffID + `","team_id":"` + staffID + `","position_id":"` + staffID + `"`
	tests := []struct {
		name, target, body, wantMessage string
	}{
		{"チームの名前が空", "/v1/facilities/" + facilityID + "/teams", `{"name":""}`, "name"},
		{"チームの色が 8 色にない", "/v1/facilities/" + facilityID + "/teams", `{"name":"A","color":"red"}`, "color"},
		{"部署の名前が空", "/v1/facilities/" + facilityID + "/departments", `{"name":""}`, "name"},
		{"部署の名前が長すぎる", "/v1/facilities/" + facilityID + "/departments", `{"name":"` + strings.Repeat("あ", 256) + `"}`, "name"},
		{"キャンセルの理由が空", "/v1/schedules/" + scheduleID + "/cancel", `{"reason":""}`, "reason"},
		{"キャンセルの理由が長すぎる", "/v1/schedules/" + scheduleID + "/cancel", `{"reason":"` + strings.Repeat("あ", 256) + `"}`, "reason"},
		{"電話番号が長すぎる", "/v1/facilities/" + facilityID + "/users", user + `,"phone_number":"+0900000000000"}`, "phone_number"},
		{"メールの形でない", "/v1/facilities/" + facilityID + "/users", strings.Replace(user, "new@example.com", "new", 1) + "}", "email"},
		{"職員の名前が空", "/v1/facilities/" + facilityID + "/users", strings.Replace(user, "新人", "", 1) + "}", "username"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec, body := do(t, newRouter(&fakeSchedules{}, &fakeStaff{}, &fakePatients{}), http.MethodPost, tt.target, tt.body)
			if rec.Code != http.StatusBadRequest || body["code"] != "invalid_input" {
				t.Fatalf("status = %d, body = %s", rec.Code, rec.Body)
			}
			if msg, _ := body["message"].(string); !strings.Contains(msg, tt.wantMessage) {
				t.Errorf("message = %q, want %q を含む", msg, tt.wantMessage)
			}
		})
	}
}

// TestRequestValidationMessages は、定義の検証のエラーの文と、空のクエリと大きな本文の扱いを確認する。
func TestRequestValidationMessages(t *testing.T) {
	h := newRouter(&fakeSchedules{}, &fakeStaff{}, &fakePatients{})
	list := "/v1/facilities/" + facilityID + "/schedules"
	if rec, _ := do(t, h, http.MethodGet, list+"?date_from=&schedule_type=&sort_field=", ""); rec.Code != http.StatusOK {
		t.Errorf("空のクエリ: status = %d, body = %s, want 200（指定なし）", rec.Code, rec.Body)
	}
	tests := []struct {
		name, method, target, body string
		want                       []string
	}{
		{"クエリの値が列挙に無い", http.MethodGet, list + "?sort_field=foo", "", []string{"query の sort_field が定義に合いません"}},
		{"本文のエラーが複数", http.MethodPost, list, `{"date":"x","start_time":"x"}`, []string{"date", "start_time", "schedule_type_id"}},
		{"本文が JSON でない", http.MethodPost, list, `{bad`, []string{bodyErrorPrefixForTest}},
		{"変えるチームの色が 8 色にない", http.MethodPut, "/v1/teams/" + staffID, `{"name":"A","color":"red"}`, []string{"color"}},
		{"変えるチームの色が無い", http.MethodPut, "/v1/teams/" + staffID, `{"name":"A"}`, []string{"color"}},
		{"変える部署の名前が空", http.MethodPut, "/v1/departments/" + staffID, `{"name":""}`, []string{"name"}},
		{"本文が大きすぎる", http.MethodPost, "/v1/schedules/" + scheduleID + "/cancel",
			`{"reason":"` + strings.Repeat("a", 1<<20) + `"}`, []string{"バイトまでです"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec, body := do(t, h, tt.method, tt.target, tt.body)
			if rec.Code != http.StatusBadRequest || body["code"] != "invalid_input" {
				t.Fatalf("status = %d, body = %.300s", rec.Code, rec.Body)
			}
			msg, _ := body["message"].(string)
			for _, w := range tt.want {
				if !strings.Contains(msg, w) {
					t.Errorf("message = %q, want %q を含む", msg, w)
				}
			}
		})
	}
}

// 職員の変更は、訪問するかを受け取る。予定か担当の利用者が残る職員を訪問しない職員に変えようとしたときは、409 で残る一覧を返す（ADR-0022）。
func TestUpdateUserVisits(t *testing.T) {
	const depID, teamID = "01M3TC5HZ8A18D2TP3PTKDXJMN", "01M3TC5MX04QJ19X6XR1ZCBZRJ"
	nonVisiting := `{"username":"青木","department_id":"` + depID + `","team_id":"` + teamID + `","visits":false}`
	st := &fakeStaff{}
	rec, body := do(t, newRouter(&fakeSchedules{}, st, &fakePatients{}), http.MethodPut, "/v1/users/"+staffID, nonVisiting)
	if rec.Code != http.StatusOK || !st.lastProfile.NonVisiting || body["visits"] != false {
		t.Fatalf("status = %d, 入力 = %+v, body = %v, want 200 で訪問しない職員", rec.Code, st.lastProfile, body)
	}

	assigned := &staff.AssignedError{NonVisiting: true, Assignments: staff.Assignments{
		Patients: []staff.AssignedPatient{{ID: patientID, Name: "見本 花子"}},
	}}
	rec, body = do(t, newRouter(&fakeSchedules{}, &fakeStaff{err: assigned}, &fakePatients{}), http.MethodPut, "/v1/users/"+staffID, nonVisiting)
	if rec.Code != http.StatusConflict || body["code"] != "staff_has_assignments" || body["message"] != assigned.Error() {
		t.Fatalf("残る担当: status = %d, body = %v, want 409 staff_has_assignments", rec.Code, body)
	}
	if pats := body["assignments"].(map[string]any)["patients"].([]any); len(pats) != 1 {
		t.Errorf("assignments = %v, want 担当の利用者 1 件", body["assignments"])
	}
}

// 職員の登録は、visits を省くと訪問する職員として登録する（ADR-0022）。
func TestCreateUserVisits(t *testing.T) {
	user := `{"username":"新人","email":"new@example.com","department_id":"` + staffID + `","team_id":"` + staffID + `","position_id":"` + staffID + `"`
	for name, c := range map[string]struct {
		body        string
		nonVisiting bool
	}{
		"省く":    {user + `}`, false},
		"訪問する":  {user + `,"visits":true}`, false},
		"訪問しない": {user + `,"visits":false}`, true},
	} {
		st := &fakeStaff{}
		rec, body := do(t, newRouter(&fakeSchedules{}, st, &fakePatients{}), http.MethodPost, "/v1/facilities/"+facilityID+"/users", c.body)
		if rec.Code != http.StatusCreated || st.lastCreate.NonVisiting != c.nonVisiting || body["visits"] != !c.nonVisiting {
			t.Errorf("%s: status = %d, 入力 = %+v, body = %v", name, rec.Code, st.lastCreate, body)
		}
	}
}
