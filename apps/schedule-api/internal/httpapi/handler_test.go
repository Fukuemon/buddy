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
	"strings"
	"testing"

	"github.com/Fukuemon/buddy/apps/schedule-api/internal/apperr"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/civil"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/httpapi"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/kernel"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/patient"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/principal"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/schedule"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/staff"
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
	err              error
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
	return staff.Detail{Summary: staff.Summary{Staff: staff.Staff{ID: staffID, PositionID: positionID}}, Policies: []staff.PolicyGrant{}}, nil
}

func (f *fakeStaff) Create(context.Context, staff.CreateInput) (staff.Detail, error) {
	return staff.Detail{Policies: []staff.PolicyGrant{}}, f.err
}

func (f *fakeStaff) Get(context.Context, string) (staff.Detail, error) { return staff.Detail{}, nil }

func (f *fakeStaff) List(_ context.Context, _ string, q staff.ListQuery) ([]staff.Summary, error) {
	f.listCalls++
	f.lastQuery = q
	return []staff.Summary{}, nil
}

type fakePatients struct {
	listCalls int
	err       error
}

func (f *fakePatients) Create(context.Context, patient.CreateInput) (patient.Detail, error) {
	return patient.Detail{}, f.err
}

func (f *fakePatients) List(context.Context, string, patient.ListQuery) ([]patient.Detail, error) {
	f.listCalls++
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
	if s.lastQuery.Sort != (kernel.Sort{Field: "start_time", Desc: true}) ||
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
		{"healthz は依存先を確かめない", routerWithReady(errors.New("down")), "/healthz", http.StatusOK, "ok"},
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
}

// TestUsecaseReceivesPrincipal は、操作が権限を判定できるよう、認証のミドルウェアが特定した職員を ctx で渡すことを確かめる。
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

// TestCORSPreflight は、許した origin からのプリフライトのリクエストに、API が使う全てのメソッドを許すことを確かめる。
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

// TestCreateForbidden は、職員の管理の権限が無いときに、職員と利用者の登録が 403 になることを確かめる。
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

// TestRequestConstraints は、openapi.yaml に書いた本文の制約で、handler を呼ぶ前に 400 を返すことを確かめる。
func TestRequestConstraints(t *testing.T) {
	user := `{"username":"新人","email":"new@example.com","department_id":"` + staffID + `","team_id":"` + staffID + `","position_id":"` + staffID + `"`
	tests := []struct {
		name, target, body, wantMessage string
	}{
		{"チームの名前が空", "/v1/facilities/" + facilityID + "/teams", `{"name":""}`, "name"},
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

// TestRequestValidationMessages は、定義の検証のエラーの文と、空のクエリと大きな本文の扱いを確かめる。
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
