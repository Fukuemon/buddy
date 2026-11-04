package httpapi_test

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"reflect"
	"testing"

	"github.com/Fukuemon/buddy/services/schedule/internal/access"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/patient"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/schedule"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/scheduleview"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/servicecode"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/staff"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/visit"
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
	app := httpapi.ScheduleApp{
		ListTypes:        schedule.NewListTypes(types).Do,
		Get:              scheduleview.NewGet(schedules, refs).Do,
		GetRecurring:     scheduleview.NewGetRecurring(recurring, refs).Do,
		List:             scheduleview.NewList(facilities, schedules, recurring, refs, scheduleview.ProjectionDeps{}).Do,
		Create:           schedule.NewCreate(facilities, schedules, types, refs, facilities, visits, nil, nil, tx, ids).Do,
		CreateRecurring:  schedule.NewCreateRecurring(facilities, types, refs, facilities, visits, nil, recurring, nil, tx, ids).Do,
		ChangeOccurrence: schedule.NewChangeOccurrence(recurring, refs, facilities, schedules, types, visits, nil, nil, tx, ids).Do,
		Cancel:           schedule.NewCancel(schedules, refs, facilities, nil, tx, ids).Do,
		Update:           schedule.NewUpdate(schedules, refs, facilities, types, visits, nil, nil, tx).Do,
	}
	auth := flowAuth{svc: access.NewService(access.Deps{Resources: map[access.Resource]access.FacilityReader{
		access.ResourceSchedule: schedules, access.ResourceRecurringSchedule: recurring,
	}})}
	return httpapi.NewRouter(httpapi.Apps{Schedules: app, Auth: auth}, httpapi.RouterConfig{
		Logger:   slog.New(slog.NewTextHandler(io.Discard, nil)),
		Verifier: testVerifier,
	})
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

// TestScheduleWritesRejectGooglePrimary は、Google カレンダーを予定の正本にする事業所で、予定の作成と繰り返しの予定の作成が
// 409 と code の google_primary を返すことを確認する（ADR-0035）。
func TestScheduleWritesRejectGooglePrimary(t *testing.T) {
	h := flowRouterWith(organization.SourceGooglePrimary)
	body := `{"schedule_type_id":"` + typeID + `","date":"2099-01-05","start_time":"09:00","end_time":"10:00","staff_id":"` + staffID + `","title":"カンファレンス"}`
	for _, target := range []string{"/v1/facilities/" + facilityID + "/schedules", "/v1/facilities/" + facilityID + "/schedules/recurring"} {
		b := body
		if target != "/v1/facilities/"+facilityID+"/schedules" {
			b = b[:len(b)-1] + `,"recurring_rule":{"frequency":"weekly"}}`
		}
		got := request(t, h, http.MethodPost, target, b, http.StatusConflict)
		if got["code"] != schedule.CodeGooglePrimary {
			t.Errorf("%s の code = %v, want %s", target, got["code"], schedule.CodeGooglePrimary)
		}
	}
}
