package httpapi_test

import (
	"net/http"
	"reflect"
	"testing"

	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
)

// TestDeleteSchedule は、buddy_primary の事業所で単発の予定を削除すると 204 を返し、一覧と取得に出なくなることを確認する。
// 今日より前の予定、キャンセル済みの予定、google_primary の事業所の予定の削除が拒まれることも確認する（ADR-0040）。
func TestDeleteSchedule(t *testing.T) {
	h, s := flowRouterOn(organization.SourceBuddyPrimary, nil)
	create := func(date string) string {
		got := request(t, h, http.MethodPost, "/v1/facilities/"+facilityID+"/schedules", `{"schedule_type_id":"`+typeID+`",
			"date":"`+date+`","start_time":"10:00","end_time":"11:00","staff_id":"`+staffID+`","title":"誤入力"}`, http.StatusCreated)
		id, _ := got["id"].(string)
		return id
	}
	id := create("2099-01-05")
	request(t, h, http.MethodDelete, "/v1/schedules/"+id, "", http.StatusNoContent)
	request(t, h, http.MethodGet, "/v1/schedules/"+id, "", http.StatusNotFound)
	list := request(t, h, http.MethodGet, "/v1/facilities/"+facilityID+"/schedules?date_from=2099-01-01&date_to=2099-01-31", "", http.StatusOK)
	if got, _ := list["schedules"].([]any); len(got) != 0 {
		t.Errorf("一覧の単発の予定 = %v, want 削除した予定を出さない", got)
	}
	if len(s.Deletions) != 1 || s.Deletions[0].ScheduleID != id {
		t.Errorf("監査の記録 = %+v, want 削除した予定の 1 件", s.Deletions)
	}

	cancelled := create("2099-01-06")
	request(t, h, http.MethodPost, "/v1/schedules/"+cancelled+"/cancel", `{"reason":"利用者の都合"}`, http.StatusCreated)
	past := create("2000-01-04")
	for _, tt := range []struct {
		name, id string
		status   int
		code     string
	}{
		{"削除した予定", id, http.StatusNotFound, "not_found"},
		{"キャンセル済みの予定", cancelled, http.StatusConflict, "conflict"},
		{"今日より前の予定", past, http.StatusBadRequest, "invalid_input"},
	} {
		t.Run(tt.name, func(t *testing.T) {
			if got := request(t, h, http.MethodDelete, "/v1/schedules/"+tt.id, "", tt.status); got["code"] != tt.code {
				t.Errorf("code = %v, want %s", got["code"], tt.code)
			}
		})
	}

	kept := create("2099-01-07")
	f := s.Facilities[facilityID]
	f.SourceMode = organization.SourceGooglePrimary
	s.Facilities[facilityID] = f
	// google_primary の予定の ID は Projection の ID で、buddy の予定のテーブルに行が無いことが多い
	for _, target := range []string{kept, "01M3TCZZZZZZZZZZZZZZZZZZZZ"} {
		if got := request(t, h, http.MethodDelete, "/v1/schedules/"+target, "", http.StatusConflict); got["code"] != "google_primary" {
			t.Errorf("%s の code = %v, want google_primary", target, got["code"])
		}
	}
}

// TestDeleteOccurrence は、繰り返しの予定の 1 回を削除すると、その日を除外する日に足し、単発の予定を作らないことを確認する。
// 同じ回の 2 度目の削除、回に当たらない日、今日より前の回、google_primary の事業所の応答も確認する（ADR-0040）。
func TestDeleteOccurrence(t *testing.T) {
	h, s := flowRouterOn(organization.SourceBuddyPrimary, nil)
	rs := request(t, h, http.MethodPost, "/v1/facilities/"+facilityID+"/schedules/recurring", `{"schedule_type_id":"`+typeID+`",
		"date":"2000-01-03","start_time":"10:00","end_time":"11:00","staff_id":"`+staffID+`","title":"定例",
		"recurring_rule":{"frequency":"weekly"}}`, http.StatusCreated)
	rsID, _ := rs["id"].(string)
	target := "/v1/schedules/recurring/" + rsID + "/occurrences/delete"

	request(t, h, http.MethodPost, target, `{"original_date":"2099-01-05"}`, http.StatusNoContent)
	list := request(t, h, http.MethodGet, "/v1/facilities/"+facilityID+"/schedules?date_from=2099-01-01&date_to=2099-01-31", "", http.StatusOK)
	if got, _ := list["schedules"].([]any); len(got) != 0 {
		t.Errorf("一覧の単発の予定 = %v, want 作らない", got)
	}
	parents, _ := list["recurring_schedules"].([]any)
	if len(parents) != 1 || !reflect.DeepEqual(field(t, parents[0].(map[string]any), "exclusion_dates"), []any{"2099-01-05"}) {
		t.Errorf("一覧の繰り返しの予定 = %v, want exclusion_dates が 2099-01-05 の 1 件", parents)
	}

	for _, tt := range []struct {
		name, body string
		status     int
	}{
		{"同じ回を 2 度削除する", `{"original_date":"2099-01-05"}`, http.StatusConflict},
		{"回に当たらない日", `{"original_date":"2099-01-06"}`, http.StatusBadRequest},
		{"今日より前の回", `{"original_date":"2000-01-10"}`, http.StatusBadRequest},
	} {
		t.Run(tt.name, func(t *testing.T) {
			request(t, h, http.MethodPost, target, tt.body, tt.status)
		})
	}

	f := s.Facilities[facilityID]
	f.SourceMode = organization.SourceGooglePrimary
	s.Facilities[facilityID] = f
	if got := request(t, h, http.MethodPost, target, `{"original_date":"2099-01-12"}`, http.StatusConflict); got["code"] != "google_primary" {
		t.Errorf("code = %v, want google_primary", got["code"])
	}
}
