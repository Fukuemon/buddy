package httpapi_test

import (
	"net/http"
	"reflect"
	"testing"

	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
)

// TestCancelOccurrence は、buddy_primary の事業所で繰り返しの予定の 1 回をキャンセルすると、予定の一覧がその回を
// 繰り返しの予定の除外する日にし、繰り返しの予定と同じ内容のキャンセルした単発の予定として返すことを確認する。
// 同じ回のキャンセルと置き換え、回に当たらない日、google_primary の事業所の応答も確認する。
func TestCancelOccurrence(t *testing.T) {
	h := flowRouter()
	rs := request(t, h, http.MethodPost, "/v1/facilities/"+facilityID+"/schedules/recurring", `{"schedule_type_id":"`+flowVisitTypeID+`",
		"date":"2099-01-05","start_time":"10:00","end_time":"11:00","staff_id":"`+staffID+`",
		"visit_info":{"patient_id":"`+flowPatientID+`","assigned_staff_id":"`+staffID+`","service_code_id":"`+flowCodeID+`",
		"visit_category_ids":["`+flowCategoryID+`"]},"recurring_rule":{"frequency":"weekly"}}`, http.StatusCreated)
	rsID, _ := rs["id"].(string)
	target := "/v1/schedules/recurring/" + rsID + "/occurrences/cancel"

	cancelled := request(t, h, http.MethodPost, target, `{"original_date":"2099-01-12","reason":"利用者の入院"}`, http.StatusCreated)
	if cancelled["reason"] != "利用者の入院" || cancelled["id"] == "" {
		t.Errorf("キャンセルの応答 = %v", cancelled)
	}
	scheduleID, _ := cancelled["schedule_id"].(string)

	list := request(t, h, http.MethodGet, "/v1/facilities/"+facilityID+"/schedules?date_from=2099-01-01&date_to=2099-01-31", "", http.StatusOK)
	schedules, _ := list["schedules"].([]any)
	if len(schedules) != 1 {
		t.Fatalf("一覧の単発の予定 = %v, want キャンセルした回の 1 件", schedules)
	}
	got, _ := schedules[0].(map[string]any)
	for key, want := range map[string]any{
		"id": scheduleID, "recurring_schedule_id": rsID, "date": "2099-01-12", "start_time": "10:00", "end_time": "11:00", "staff_id": staffID,
	} {
		if v := field(t, got, key); v != want {
			t.Errorf("キャンセルした回の %s = %v, want %v", key, v, want)
		}
	}
	// メモリ上の一覧は訪問の情報とキャンセルを結合しないので、1 件の取得で読む
	read := request(t, h, http.MethodGet, "/v1/schedules/"+scheduleID, "", http.StatusOK)
	if !reflect.DeepEqual(read["cancel"], cancelled) {
		t.Errorf("キャンセルした回の cancel = %v, want %v", read["cancel"], cancelled)
	}
	if v := field(t, read, "visit_info", "patient_id"); v != flowPatientID {
		t.Errorf("キャンセルした回の visit_info.patient_id = %v, want 繰り返しの予定の利用者", v)
	}
	parents, _ := list["recurring_schedules"].([]any)
	if len(parents) != 1 || !reflect.DeepEqual(field(t, parents[0].(map[string]any), "exclusion_dates"), []any{"2099-01-12"}) {
		t.Errorf("一覧の繰り返しの予定 = %v, want exclusion_dates が 2099-01-12 の 1 件", parents)
	}

	for _, tt := range []struct {
		name, method, target, body string
		status                     int
	}{
		{"同じ回を 2 度キャンセルする", http.MethodPost, target, `{"original_date":"2099-01-12","reason":"重複"}`, http.StatusConflict},
		{"キャンセルした回を置き換える", http.MethodPost, "/v1/schedules/recurring/" + rsID + "/occurrences", `{"original_date":"2099-01-12",
			"schedule_type_id":"` + typeID + `","date":"2099-01-12","start_time":"10:00","end_time":"11:00","staff_id":"` + staffID + `","title":"振替"}`, http.StatusConflict},
		{"回に当たらない日", http.MethodPost, target, `{"original_date":"2099-01-13","reason":"体調不良"}`, http.StatusBadRequest},
		{"理由が空", http.MethodPost, target, `{"original_date":"2099-01-19","reason":""}`, http.StatusBadRequest},
		{"キャンセルした予定を変える", http.MethodPut, "/v1/schedules/" + scheduleID, `{"schedule_type_id":"` + typeID + `","date":"2099-01-12",
			"start_time":"10:00","end_time":"11:00","staff_id":"` + staffID + `","title":"戻す"}`, http.StatusConflict},
	} {
		t.Run(tt.name, func(t *testing.T) {
			request(t, h, tt.method, tt.target, tt.body, tt.status)
		})
	}
}

// TestCancelOccurrenceGooglePrimary は、google_primary の事業所の回のキャンセルが、409（google_primary）で拒まれることを確認する。
// google_primary の回は cancelSchedule で回の ID を指してキャンセルする。
func TestCancelOccurrenceGooglePrimary(t *testing.T) {
	h, s := flowRouterOn(organization.SourceBuddyPrimary, nil)
	rs := request(t, h, http.MethodPost, "/v1/facilities/"+facilityID+"/schedules/recurring", `{"schedule_type_id":"`+typeID+`",
		"date":"2099-01-05","start_time":"10:00","end_time":"11:00","staff_id":"`+staffID+`","title":"定例",
		"recurring_rule":{"frequency":"weekly"}}`, http.StatusCreated)
	rsID, _ := rs["id"].(string)
	f := s.Facilities[facilityID]
	f.SourceMode = organization.SourceGooglePrimary
	s.Facilities[facilityID] = f

	got := request(t, h, http.MethodPost, "/v1/schedules/recurring/"+rsID+"/occurrences/cancel", `{"original_date":"2099-01-12","reason":"休み"}`, http.StatusConflict)
	if got["code"] != "google_primary" {
		t.Errorf("code = %v, want google_primary", got["code"])
	}
}
