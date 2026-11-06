package httpapi_test

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"reflect"
	"strconv"
	"strings"
	"testing"

	calendarv3 "google.golang.org/api/calendar/v3"

	"github.com/Fukuemon/buddy/services/schedule/internal/access"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendar"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendarwrite"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/patient"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/schedule"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/scheduleview"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/servicecode"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/staff"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/visit"
	"github.com/Fukuemon/buddy/services/schedule/internal/gcal"
	"github.com/Fukuemon/buddy/services/schedule/internal/gcal/gcaltest"
	"github.com/Fukuemon/buddy/services/schedule/internal/httpapi"
	"github.com/Fukuemon/buddy/services/schedule/internal/inmem"
	"github.com/Fukuemon/buddy/services/schedule/internal/principal"
	"github.com/Fukuemon/buddy/services/schedule/internal/ulid"
)

// flowRouter が入れる値の ID。リクエストの検証が ULID の形を求めるので、ULID にする。
const (
	flowCompanionID = "01M3TC5VQR3MKFF9AA4BVKF44Z"
	flowPatientID   = "01M3TC66FGZVK39Y7GRVZSGWS1"
	flowCodeID      = "01M3TC60M0XC173N54CJQRKFVR"
	flowCategoryID  = "01M3TC64H0JJHBDMJQPGBX9FM7"
	flowVisitTypeID = "01M3TC69D8KB2938F3GS7WBVT5"
)

// flowAuth は、事業所の全ての予定を編集できる職員 staffID を認証し、リソースの事業所を access.Service で引く。
type flowAuth struct{ svc *access.Service }

func (flowAuth) Authenticate(context.Context, principal.Identity) (principal.Principal, error) {
	return principal.Principal{Staff: principal.Staff{
		ID: staffID, FacilityID: facilityID,
		Policies: []staff.PolicyGrant{{PolicyCode: organization.ScheduleAllEdit}},
	}}, nil
}

func (a flowAuth) FacilityOf(ctx context.Context, r access.Resource, id string) (string, error) {
	return a.svc.FacilityOf(ctx, r, id)
}

// flowRouter は、メモリ上のリポジトリの上に、本物の schedule と scheduleview の操作を組み立てたルーターを返す。
func flowRouter() http.Handler {
	return flowRouterWith(organization.SourceBuddyPrimary)
}

// flowRouterWith は、事業所の正本のモードを mode にした flowRouter を返す。
func flowRouterWith(mode organization.SourceMode) http.Handler {
	h, _ := flowRouterOn(mode, nil)
	return h
}

// flowRouterOn は、事業所の正本のモードを mode にし、google_primary の予定の作成が accounts で Google カレンダーに書く
// flowRouter と、そのメモリ上のリポジトリを返す。
func flowRouterOn(mode organization.SourceMode, accounts calendar.Accounts) (http.Handler, *inmem.Store) {
	s := inmem.NewStore()
	s.Facilities[facilityID] = organization.Facility{ID: facilityID, OrgID: testOrgID, SourceMode: mode}
	for _, id := range []string{staffID, flowCompanionID} {
		s.Staff[id] = staff.Detail{Summary: staff.Summary{Staff: staff.Staff{ID: id, FacilityID: facilityID}}}
	}
	s.Patients[flowPatientID] = patient.Detail{Patient: patient.Patient{ID: flowPatientID, FacilityID: facilityID}}
	s.Codes[flowCodeID] = servicecode.ServiceCode{ID: flowCodeID}
	s.Categories[flowCategoryID] = visit.Category{ID: flowCategoryID}
	s.Types[typeID] = schedule.Type{ID: typeID, Code: schedule.CodeNormal, Name: schedule.Normal}
	s.Types[flowVisitTypeID] = schedule.Type{ID: flowVisitTypeID, Code: schedule.CodeVisit, Name: schedule.Visit}

	ids := ulid.Generator{}
	tx := &inmem.Tx{}
	facilities := inmem.Facilities{Store: s}
	refs := inmem.StaffRefs{Store: s}
	schedules := inmem.Schedules{Store: s}
	recurring := inmem.RecurringSchedules{Store: s}
	types := inmem.ScheduleTypes{Store: s}
	visits := visit.NewWriter(visit.WriterDeps{
		Staff: refs, Patients: inmem.Patients{Store: s}, Infos: inmem.VisitInfos{Store: s}, ServiceCodes: inmem.ServiceCodes{Store: s}, Categories: inmem.VisitCategories{Store: s},
	}, ids)
	projected := scheduleview.ProjectionDeps{
		Projections: inmem.Projections{Store: s}, Syncs: inmem.Projections{Store: s}, Rules: calendar.ProjectionRules{},
		Patients: inmem.Patients{Store: s}, ServiceCodes: inmem.ServiceCodes{Store: s}, Types: types,
	}
	app := httpapi.ScheduleApp{
		ListTypes:        schedule.NewListTypes(types).Do,
		Get:              scheduleview.NewGet(schedules, refs).Do,
		GetProjected:     scheduleview.NewGetProjected(projected, refs).Do,
		GetRecurring:     scheduleview.NewGetRecurring(recurring, refs).Do,
		List:             scheduleview.NewList(facilities, schedules, recurring, refs, projected).Do,
		Create:           schedule.NewCreate(facilities, schedules, types, refs, facilities, visits, nil, nil, tx, ids).Do,
		CreateRecurring:  schedule.NewCreateRecurring(facilities, types, refs, facilities, visits, nil, recurring, nil, tx, ids).Do,
		ChangeOccurrence: schedule.NewChangeOccurrence(recurring, refs, facilities, schedules, types, visits, nil, nil, tx, ids).Do,
		Cancel:           schedule.NewCancel(schedules, refs, facilities, nil, tx, ids).Do,
		Update:           schedule.NewUpdate(schedules, refs, facilities, types, visits, nil, nil, tx).Do,
	}
	auth := flowAuth{svc: access.NewService(access.Deps{Resources: map[access.Resource]access.FacilityReader{
		access.ResourceSchedule: schedules, access.ResourceRecurringSchedule: recurring,
	}})}
	projections, records, calendars := inmem.Projections{Store: s}, inmem.CalendarEventRecords{Store: s}, inmem.Calendars{Store: s}
	writes := httpapi.CalendarWriteApp{
		Create: calendarwrite.NewCreate(facilities, projections, types, refs, inmem.Staff{Store: s},
			visits, inmem.VisitInfos{Store: s}, calendars, records, projections, accounts, nil, tx).Do,
		Update: calendarwrite.NewUpdate(facilities, projections, types, refs, inmem.Staff{Store: s},
			visits, inmem.VisitInfos{Store: s}, calendars, records, projections, accounts, ids, slog.New(slog.DiscardHandler), nil, tx).Do,
		Cancel: calendarwrite.NewCancel(facilities, projections, refs, visits, calendars, records, projections, accounts, nil, tx).Do,
	}
	org := httpapi.OrganizationApp{GetFacility: organization.NewGetFacility(facilities).Do}
	return httpapi.NewRouter(httpapi.Apps{Organization: org, Schedules: app, CalendarWrites: writes, Auth: auth}, httpapi.RouterConfig{
		Logger:   slog.New(slog.NewTextHandler(io.Discard, nil)),
		Verifier: testVerifier,
	}), s
}

// request は、h にリクエストを送り、応答の状態が status でないときに止める。
func request(t *testing.T, h http.Handler, method, target, body string, status int) map[string]any {
	t.Helper()
	rec, got := do(t, h, method, target, body)
	if rec.Code != status {
		t.Fatalf("%s %s: status = %d, body = %s", method, target, rec.Code, rec.Body)
	}
	return got
}

// requireSameAsRead は、予定を書いた応答 written が、target を読み直した応答と同じであることを確認する。
func requireSameAsRead(t *testing.T, h http.Handler, written map[string]any, target string) {
	t.Helper()
	read := request(t, h, http.MethodGet, target, "", http.StatusOK)
	if !reflect.DeepEqual(written, read) {
		t.Errorf("書いた応答と読み直した応答が違う\n書いた応答 = %v\n読み直し   = %v", written, read)
	}
}

func field(t *testing.T, m map[string]any, keys ...string) any {
	t.Helper()
	var v any = m
	for _, k := range keys {
		mm, ok := v.(map[string]any)
		if !ok {
			t.Fatalf("%v の %s が object でない: %v", keys, k, v)
		}
		v = mm[k]
	}
	return v
}

// TestScheduleWritesRespondWithStoredSchedule は、予定の作成、繰り返しの予定の作成、回の置き換え、変更、キャンセルの応答が、
// 本物の操作を通しても、書いた予定を読み直した応答と同じ形と値であることを確認する。
func TestScheduleWritesRespondWithStoredSchedule(t *testing.T) {
	h := flowRouter()
	visitBody := `{"schedule_type_id":"` + flowVisitTypeID + `","date":"2099-01-05","start_time":"17:30","end_time":"18:00",
		"staff_id":"` + staffID + `","description":"初回の訪問","visit_info":{"patient_id":"` + flowPatientID + `",
		"assigned_staff_id":"` + staffID + `","companion_id":"` + flowCompanionID + `","service_code_id":"` + flowCodeID + `",
		"visit_category_ids":["` + flowCategoryID + `"]}}`

	created := request(t, h, http.MethodPost, "/v1/facilities/"+facilityID+"/schedules", visitBody, http.StatusCreated)
	id, _ := created["id"].(string)
	requireSameAsRead(t, h, created, "/v1/schedules/"+id)
	for key, want := range map[string]any{
		"facility_id": facilityID, "schedule_type_id": flowVisitTypeID, "schedule_type": "訪問", "staff_id": staffID,
		"date": "2099-01-05", "start_time": "17:30", "end_time": "18:00", "ends_next_day": false, "is_over_time_work": true,
		"description": "初回の訪問", "title": nil, "recurring_schedule_id": nil, "cancel": nil,
	} {
		if got := field(t, created, key); got != want {
			t.Errorf("作成の応答の %s = %v, want %v", key, got, want)
		}
	}
	for key, want := range map[string]any{"patient_id": flowPatientID, "assigned_staff_id": staffID, "companion_id": flowCompanionID, "service_code_id": flowCodeID} {
		if got := field(t, created, "visit_info", key); got != want {
			t.Errorf("作成の応答の visit_info.%s = %v, want %v", key, got, want)
		}
	}

	updated := request(t, h, http.MethodPut, "/v1/schedules/"+id, `{"schedule_type_id":"`+typeID+`","date":"2099-01-06",
		"start_time":"09:00","end_time":"10:00","staff_id":"`+flowCompanionID+`","title":"カンファレンス"}`, http.StatusOK)
	requireSameAsRead(t, h, updated, "/v1/schedules/"+id)
	for key, want := range map[string]any{
		"id": id, "schedule_type": "通常", "staff_id": flowCompanionID, "date": "2099-01-06", "is_over_time_work": false,
		"title": "カンファレンス", "visit_info": nil, "cancel": nil,
	} {
		if got := field(t, updated, key); got != want {
			t.Errorf("変更の応答の %s = %v, want %v", key, got, want)
		}
	}

	cancelled := request(t, h, http.MethodPost, "/v1/schedules/"+id+"/cancel", `{"reason":"体調不良"}`, http.StatusCreated)
	if cancelled["schedule_id"] != id || cancelled["reason"] != "体調不良" || cancelled["id"] == "" {
		t.Errorf("キャンセルの応答 = %v", cancelled)
	}
	read := request(t, h, http.MethodGet, "/v1/schedules/"+id, "", http.StatusOK)
	if !reflect.DeepEqual(read["cancel"], cancelled) {
		t.Errorf("読み直した予定の cancel = %v, want %v", read["cancel"], cancelled)
	}

	rs := request(t, h, http.MethodPost, "/v1/facilities/"+facilityID+"/schedules/recurring", `{"schedule_type_id":"`+typeID+`",
		"date":"2099-01-05","start_time":"22:00","end_time":"01:00","ends_next_day":true,"staff_id":"`+staffID+`",
		"title":"夜間の待機","recurring_rule":{"frequency":"weekly"}}`, http.StatusCreated)
	rsID, _ := rs["id"].(string)
	requireSameAsRead(t, h, rs, "/v1/schedules/recurring/"+rsID)
	for key, want := range map[string]any{
		"schedule_type": "通常", "staff_id": staffID, "date": "2099-01-05", "ends_next_day": true, "title": "夜間の待機", "visit_info": nil,
	} {
		if got := field(t, rs, key); got != want {
			t.Errorf("繰り返しの予定の作成の応答の %s = %v, want %v", key, got, want)
		}
	}
	if got := field(t, rs, "recurring_rule", "frequency"); got != "weekly" {
		t.Errorf("繰り返しの規則 = %v", got)
	}

	replaced := request(t, h, http.MethodPost, "/v1/schedules/recurring/"+rsID+"/occurrences", `{"original_date":"2099-01-12",
		"schedule_type_id":"`+typeID+`","date":"2099-01-13","start_time":"21:00","end_time":"23:00","staff_id":"`+staffID+`",
		"title":"夜間の待機（振替）"}`, http.StatusCreated)
	replacedID, _ := replaced["id"].(string)
	requireSameAsRead(t, h, replaced, "/v1/schedules/"+replacedID)
	for key, want := range map[string]any{
		"recurring_schedule_id": rsID, "date": "2099-01-13", "start_time": "21:00", "ends_next_day": false, "title": "夜間の待機（振替）",
	} {
		if got := field(t, replaced, key); got != want {
			t.Errorf("回の置き換えの応答の %s = %v, want %v", key, got, want)
		}
	}
	parent := request(t, h, http.MethodGet, "/v1/schedules/recurring/"+rsID, "", http.StatusOK)
	if got := parent["exclusion_dates"]; !reflect.DeepEqual(got, []any{"2099-01-12"}) {
		t.Errorf("置き換えた後の繰り返しの予定の exclusion_dates = %v", got)
	}
}

// TestScheduleWritesRejectGooglePrimary は、Google カレンダーを予定の正本にする事業所で、繰り返しの予定の作成が
// 409 と code の google_primary を返すことを確認する（ADR-0023）。単発の予定の作成は Google カレンダーに書く。
func TestScheduleWritesRejectGooglePrimary(t *testing.T) {
	h := flowRouterWith(organization.SourceGooglePrimary)
	body := `{"schedule_type_id":"` + typeID + `","date":"2099-01-05","start_time":"09:00","end_time":"10:00","staff_id":"` + staffID +
		`","title":"カンファレンス","recurring_rule":{"frequency":"weekly"}}`
	got := request(t, h, http.MethodPost, "/v1/facilities/"+facilityID+"/schedules/recurring", body, http.StatusConflict)
	if got["code"] != schedule.CodeGooglePrimary {
		t.Errorf("code = %v, want %s", got["code"], schedule.CodeGooglePrimary)
	}
}

// googleAccounts は、どの事業所にも gcaltest のフェイクで読み書きする calendar.Accounts である。
type googleAccounts struct{ svc *calendarv3.Service }

func (googleAccounts) ServiceAccount(context.Context, string) (string, error) {
	return "sa@example.com", nil
}

func (a googleAccounts) Source(context.Context, string) (calendar.EventSource, error) {
	return gcal.NewReader(a.svc), nil
}

func (a googleAccounts) Writer(context.Context, string) (calendar.EventWriter, error) {
	return gcal.NewWriter(a.svc), nil
}

// TestCreateScheduleGooglePrimary は、google_primary の事業所で createSchedule を呼ぶと、予定の職員のカレンダーに
// `【サービス内容】利用者名` の予定ができ、応答と、Projection と訪問の情報の記録ができることを確認する。
// カレンダーが無いときと、Google が結果の分からないエラーを返したときの応答も確認する。
func TestCreateScheduleGooglePrimary(t *testing.T) {
	const (
		calendarAddr = "staff@example.com"
		newID        = "01M3TC6CX4Y3D0KCGJ5A9N0WQZ"
	)
	google := &gcaltest.Server{Calendars: map[string][][]*calendarv3.Event{calendarAddr: {nil}}}
	h, s := flowRouterOn(organization.SourceGooglePrimary, googleAccounts{gcaltest.Start(t, google)})
	p := s.Patients[flowPatientID]
	p.Name = "山田 花子"
	s.Patients[flowPatientID] = p
	s.Codes[flowCodeID] = servicecode.ServiceCode{ID: flowCodeID, Code: "訪看I3"}
	body := func(id string) string {
		return `{"id":"` + id + `","schedule_type_id":"` + flowVisitTypeID + `","date":"2099-01-05","start_time":"09:00","end_time":"10:00",` +
			`"staff_id":"` + staffID + `","visit_info":{"patient_id":"` + flowPatientID + `","assigned_staff_id":"` + staffID +
			`","service_code_id":"` + flowCodeID + `"}}`
	}
	target := "/v1/facilities/" + facilityID + "/schedules"

	got := request(t, h, http.MethodPost, target, body(newID), http.StatusConflict)
	if got["code"] != calendarwrite.CodeCalendarNotLinked || google.Writes() != 0 {
		t.Fatalf("カレンダーが無い: code = %v, Google への書き込み = %d", got["code"], google.Writes())
	}

	s.Calendars["CAL"] = calendar.ExternalCalendar{ID: "CAL", FacilityID: facilityID, StaffID: staffID, Provider: calendar.ProviderGoogle, CalendarID: calendarAddr}
	got = request(t, h, http.MethodPost, target, body(newID), http.StatusCreated)
	if got["id"] != newID || got["source"] != "google_calendar" {
		t.Errorf("応答 = %v", got)
	}
	if v, _ := got["visit_info"].(map[string]any); v == nil || v["patient_name"] != "山田 花子" {
		t.Errorf("visit_info = %v", got["visit_info"])
	}
	eventID, err := calendar.EventIDOf(newID)
	if err != nil {
		t.Fatal(err)
	}
	if ev := google.Event(calendarAddr, eventID); ev == nil || ev.Summary != "【訪看I3】山田 花子" {
		t.Errorf("Google の予定 = %+v", ev)
	}
	if _, ok := s.Projections[inmem.ProjectionKey{ExternalCalendarID: "CAL", EventID: eventID}]; !ok {
		t.Errorf("Projection の行が無い")
	}
	if r, ok := s.Records[newID]; !ok || r.Version != 1 || r.VisitInfoID == nil {
		t.Errorf("記録 = %+v", r)
	}

	google.Failures = []int{http.StatusServiceUnavailable}
	got = request(t, h, http.MethodPost, target, body("01M3TC6D7K0QJ8J3V7Q5S2N4XB"), http.StatusServiceUnavailable)
	if got["code"] != "google_write_unknown" {
		t.Errorf("5xx: code = %v", got["code"])
	}

	got = request(t, h, http.MethodPost, target, strings.Replace(body(""), `"id":"",`, "", 1), http.StatusBadRequest)
	if got["code"] != "invalid_input" {
		t.Errorf("id が無い: code = %v", got["code"])
	}
}

// TestUpdateAndCancelScheduleGooglePrimary は、google_primary の事業所で、作った予定を作成の応答の ID と etag で読み、変え、職員を替えて移し、
// 取り消せることを確認する。読んだ後に Google で変えた予定への変更は 409 の google_event_changed になり、etag の無い変更は 400 になる。
func TestUpdateAndCancelScheduleGooglePrimary(t *testing.T) {
	const (
		calendarAddr, companionAddr = "staff@example.com", "companion@example.com"
		newID                       = "01M3TC6CX4Y3D0KCGJ5A9N0WQZ"
	)
	google := &gcaltest.Server{Calendars: map[string][][]*calendarv3.Event{calendarAddr: {nil}, companionAddr: {nil}}}
	h, s := flowRouterOn(organization.SourceGooglePrimary, googleAccounts{gcaltest.Start(t, google)})
	s.Calendars["CAL"] = calendar.ExternalCalendar{ID: "CAL", FacilityID: facilityID, StaffID: staffID, Provider: calendar.ProviderGoogle, CalendarID: calendarAddr}
	s.Calendars["CAL2"] = calendar.ExternalCalendar{ID: "CAL2", FacilityID: facilityID, StaffID: flowCompanionID, Provider: calendar.ProviderGoogle, CalendarID: companionAddr}
	slot := func(staff, start string) string {
		return `"schedule_type_id":"` + typeID + `","date":"2099-01-05","start_time":"` + start + `","end_time":"11:00","staff_id":"` + staff + `","title":"カンファレンス"`
	}
	created := request(t, h, http.MethodPost, "/v1/facilities/"+facilityID+"/schedules", `{"id":"`+newID+`",`+slot(staffID, "09:00")+`}`, http.StatusCreated)
	target := "/v1/schedules/" + newID
	read := request(t, h, http.MethodGet, target, "", http.StatusOK)
	etag, _ := read["etag"].(string)
	if read["id"] != newID || etag == "" || etag != created["etag"] {
		t.Fatalf("読んだ予定 = %v, 作成の応答の etag = %v", read, created["etag"])
	}

	request(t, h, http.MethodPut, target, `{`+slot(staffID, "10:00")+`}`, http.StatusBadRequest)
	updated := request(t, h, http.MethodPut, target, `{"etag":`+strconv.Quote(etag)+`,`+slot(staffID, "10:00")+`}`, http.StatusOK)
	if updated["start_time"] != "10:00" || updated["etag"] == etag {
		t.Errorf("変えた予定 = %v", updated)
	}
	got := request(t, h, http.MethodPut, target, `{"etag":`+strconv.Quote(etag)+`,`+slot(staffID, "09:30")+`}`, http.StatusConflict)
	if got["code"] != calendarwrite.CodeEventChanged {
		t.Errorf("古い etag での変更: code = %v", got["code"])
	}

	moved := request(t, h, http.MethodPut, target, `{"etag":`+strconv.Quote(updated["etag"].(string))+`,`+slot(flowCompanionID, "10:00")+`}`, http.StatusOK)
	if moved["id"] != newID || moved["staff_id"] != flowCompanionID || len(google.Events(calendarAddr)) != 0 || len(google.Events(companionAddr)) != 1 {
		t.Fatalf("移した予定 = %v, 前のカレンダー = %d 件, 新しいカレンダー = %d 件", moved, len(google.Events(calendarAddr)), len(google.Events(companionAddr)))
	}

	cancelled := request(t, h, http.MethodPost, target+"/cancel", `{"reason":"中止","etag":`+strconv.Quote(moved["etag"].(string))+`}`, http.StatusCreated)
	if cancelled["id"] != newID || cancelled["schedule_id"] != newID || len(google.Events(companionAddr)) != 0 {
		t.Errorf("取り消し = %v, 新しいカレンダー = %d 件", cancelled, len(google.Events(companionAddr)))
	}
	request(t, h, http.MethodGet, target, "", http.StatusNotFound)
}

// TestReadScheduleGooglePrimaryRecordVisit は、google_primary の事業所で同行者と訪問の区分を付けて作った予定を、getSchedule と
// listSchedules が、作成の応答と同じ訪問の情報で返すことと、Google でタイトルの利用者名を変えた後は、buddy の訪問の情報のまま
// review_reason を title_mismatch にして返すことを確認する。
func TestReadScheduleGooglePrimaryRecordVisit(t *testing.T) {
	const (
		calendarAddr = "staff@example.com"
		newID        = "01M3TC6CX4Y3D0KCGJ5A9N0WQZ"
	)
	google := &gcaltest.Server{Calendars: map[string][][]*calendarv3.Event{calendarAddr: {nil}}}
	h, s := flowRouterOn(organization.SourceGooglePrimary, googleAccounts{gcaltest.Start(t, google)})
	s.Calendars["CAL"] = calendar.ExternalCalendar{ID: "CAL", FacilityID: facilityID, StaffID: staffID, Provider: calendar.ProviderGoogle, CalendarID: calendarAddr}
	p := s.Patients[flowPatientID]
	p.Name = "山田 花子"
	s.Patients[flowPatientID] = p
	s.Codes[flowCodeID] = servicecode.ServiceCode{ID: flowCodeID, Code: "訪看I3"}
	created := request(t, h, http.MethodPost, "/v1/facilities/"+facilityID+"/schedules",
		`{"id":"`+newID+`","schedule_type_id":"`+flowVisitTypeID+`","date":"2099-01-05","start_time":"09:00","end_time":"10:00",`+
			`"staff_id":"`+staffID+`","visit_info":{"patient_id":"`+flowPatientID+`","assigned_staff_id":"`+staffID+
			`","companion_id":"`+flowCompanionID+`","service_code_id":"`+flowCodeID+`","visit_category_ids":["`+flowCategoryID+`"]}}`, http.StatusCreated)
	target := "/v1/schedules/" + newID
	requireSameAsRead(t, h, created, target)
	list := "/v1/facilities/" + facilityID + "/schedules?date_from=2099-01-05&date_to=2099-01-05"
	listed := request(t, h, http.MethodGet, list, "", http.StatusOK)["schedules"].([]any)
	if len(listed) != 1 || !reflect.DeepEqual(listed[0], created) {
		t.Errorf("一覧の予定 = %v, want 作成の応答 %v", listed, created)
	}
	if field(t, created, "visit_info", "companion_id") != flowCompanionID || len(field(t, created, "visit_info", "visit_categories").([]any)) != 1 {
		t.Fatalf("作成の応答の visit_info = %v, want 同行者と区分 1 つ", created["visit_info"])
	}

	eventID, err := calendar.EventIDOf(newID)
	if err != nil {
		t.Fatal(err)
	}
	key := inmem.ProjectionKey{ExternalCalendarID: "CAL", EventID: eventID}
	row := s.Projections[key]
	row.Title = "【訪看I3】佐藤 一郎"
	s.Projections[key] = row
	for name, got := range map[string]map[string]any{
		"getSchedule":   request(t, h, http.MethodGet, target, "", http.StatusOK),
		"listSchedules": request(t, h, http.MethodGet, list, "", http.StatusOK)["schedules"].([]any)[0].(map[string]any),
	} {
		if got["review_reason"] != "title_mismatch" || !reflect.DeepEqual(got["visit_info"], created["visit_info"]) || got["title"] != nil {
			t.Errorf("%s: review_reason = %v, visit_info = %v, title = %v, want title_mismatch と作成の応答の visit_info", name, got["review_reason"], got["visit_info"], got["title"])
		}
	}
}
