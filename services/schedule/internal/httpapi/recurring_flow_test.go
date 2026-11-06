package httpapi_test

import (
	"net/http"
	"reflect"
	"strconv"
	"strings"
	"testing"
	"time"

	calendarv3 "google.golang.org/api/calendar/v3"

	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendar"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendarwrite"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/gcal/gcaltest"
)

// listedSchedule は、listSchedules が返した 1 件の予定の、テストが比べる項目である。
type listedSchedule struct{ id, start, etag string }

// TestRecurringScheduleGooglePrimary は、google_primary の事業所で、createRecurringSchedule が Google カレンダーに RRULE の
// 繰り返しの予定を 1 つ作り、listSchedules が回ごとに親の予定の etag で返すことを確認する。
// 変えていない回は、一覧の id と etag で getSchedule から読め、updateSchedule で Google の例外の回にでき、親の予定の EXDATE は変わらない。
// 回の id は、回を変える前と後で同じである。変えていない回を cancelSchedule で取り消すと、Google のその回だけが取り消され、ほかの回は残る。
// changeOccurrence は、すでに変えた回を 409 で、回に当たらない日を 400 で拒む。
func TestRecurringScheduleGooglePrimary(t *testing.T) {
	const (
		calendarAddr = "staff@example.com"
		newID        = "01M3TC6CX4Y3D0KCGJ5A9N0WQZ"
	)
	google := &gcaltest.Server{Calendars: map[string][][]*calendarv3.Event{calendarAddr: {nil}}}
	h, s := flowRouterOn(organization.SourceGooglePrimary, googleAccounts{gcaltest.Start(t, google)})
	s.Calendars["CAL"] = calendar.ExternalCalendar{ID: "CAL", FacilityID: facilityID, StaffID: staffID, Provider: calendar.ProviderGoogle, CalendarID: calendarAddr}
	// 回は Projection を保持する期間（今月の前後）の中で引くので、来週の月曜から 3 回の繰り返しにする。
	today := civil.Today(time.Now())
	first := civil.DateOf(today.Time().AddDate(0, 0, 7+(8-int(today.Weekday()))%7))
	days := []civil.Date{first, civil.DateOf(first.Time().AddDate(0, 0, 7)), civil.DateOf(first.Time().AddDate(0, 0, 14))}
	slot := func(d civil.Date, start, end string) string {
		return `"schedule_type_id":"` + typeID + `","date":"` + d.String() + `","start_time":"` + start + `","end_time":"` + end +
			`","staff_id":"` + staffID + `","title":"カンファレンス"`
	}
	body := `{"id":"` + newID + `",` + slot(first, "09:00", "10:00") + `,"recurring_rule":{"frequency":"weekly","end_date":"` + days[2].String() + `"}}`
	created := request(t, h, http.MethodPost, "/v1/facilities/"+facilityID+"/schedules/recurring", body, http.StatusCreated)
	if created["id"] != newID || field(t, created, "recurring_rule", "frequency") != "weekly" {
		t.Errorf("作成の応答 = %v", created)
	}
	parentID, err := calendar.EventIDOf(newID)
	if err != nil {
		t.Fatal(err)
	}
	events := google.Events(calendarAddr)
	if len(events) != 1 || events[0].Id != parentID || len(events[0].Recurrence) != 1 || !strings.HasPrefix(events[0].Recurrence[0], "RRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=") {
		t.Fatalf("Google の予定 = %+v", events)
	}
	recurrence, parentETag := events[0].Recurrence, events[0].Etag
	request(t, h, http.MethodPost, "/v1/facilities/"+facilityID+"/schedules/recurring", strings.Replace(body, `"id":"`+newID+`",`, "", 1), http.StatusBadRequest)

	list := func() map[civil.Date]listedSchedule {
		got := request(t, h, http.MethodGet, "/v1/facilities/"+facilityID+"/schedules?date_from="+first.String()+"&date_to="+days[2].String(), "", http.StatusOK)
		out := map[civil.Date]listedSchedule{}
		for _, v := range got["schedules"].([]any) {
			sc := v.(map[string]any)
			d, err := civil.ParseDate(sc["date"].(string))
			if err != nil {
				t.Fatal(err)
			}
			etag, _ := sc["etag"].(string)
			out[d] = listedSchedule{id: sc["id"].(string), start: sc["start_time"].(string), etag: etag}
		}
		return out
	}
	before := list()
	for _, d := range days {
		if got := before[d]; got.start != "09:00" || got.etag != parentETag || got.id == "" {
			t.Errorf("%s の回 = %+v, want 09:00 と親の予定の etag %s", d, got, parentETag)
		}
	}

	var items []*calendarv3.Event
	for i, d := range days {
		start := time.Date(d.Year, d.Month, d.Day, 9, 0, 0, 0, calendar.Tokyo)
		items = append(items, &calendarv3.Event{
			Id: parentID + "_" + start.UTC().Format("20060102T150405Z"), Status: "confirmed", Summary: "カンファレンス", RecurringEventId: parentID,
			Etag:              `"i` + strconv.Itoa(i) + `"`,
			OriginalStartTime: &calendarv3.EventDateTime{DateTime: start.Format(time.RFC3339), TimeZone: calendar.TimeZone},
			Start:             &calendarv3.EventDateTime{DateTime: start.Format(time.RFC3339), TimeZone: calendar.TimeZone},
			End:               &calendarv3.EventDateTime{DateTime: start.Add(time.Hour).Format(time.RFC3339), TimeZone: calendar.TimeZone},
		})
	}
	google.Instances = map[string][]*calendarv3.Event{parentID: items}

	second := before[days[1]]
	read := request(t, h, http.MethodGet, "/v1/schedules/"+second.id, "", http.StatusOK)
	if read["id"] != second.id || read["etag"] != parentETag {
		t.Errorf("回の 1 件 = %v", read)
	}
	changed := request(t, h, http.MethodPut, "/v1/schedules/"+second.id, `{"etag":`+strconv.Quote(second.etag)+`,`+slot(days[1], "13:00", "14:00")+`}`, http.StatusOK)
	if changed["id"] != second.id || changed["start_time"] != "13:00" {
		t.Errorf("変えた回 = %v", changed)
	}
	if ev := google.Event(calendarAddr, items[1].Id); ev == nil || ev.RecurringEventId != parentID || !strings.HasSuffix(ev.Start.DateTime, "T13:00:00") {
		t.Errorf("Google の例外の回 = %+v", ev)
	}
	if ev := google.Event(calendarAddr, parentID); !reflect.DeepEqual(ev.Recurrence, recurrence) {
		t.Errorf("親の予定の繰り返し = %v, want %v", ev.Recurrence, recurrence)
	}
	after := list()
	if got := after[days[1]]; got.id != second.id || got.start != "13:00" {
		t.Errorf("変えた後の回 = %+v, want id %s の 13:00", got, second.id)
	}

	occurrences := "/v1/schedules/recurring/" + newID + "/occurrences"
	request(t, h, http.MethodPost, occurrences, `{"original_date":"`+days[1].String()+`",`+slot(days[1], "15:00", "16:00")+`}`, http.StatusConflict)
	notOccurrence := civil.DateOf(days[1].Time().AddDate(0, 0, 1))
	request(t, h, http.MethodPost, occurrences, `{"original_date":"`+notOccurrence.String()+`",`+slot(days[1], "15:00", "16:00")+`}`, http.StatusBadRequest)

	third := after[days[2]]
	cancelled := request(t, h, http.MethodPost, "/v1/schedules/"+third.id+"/cancel", `{"reason":"中止","etag":`+strconv.Quote(third.etag)+`}`, http.StatusCreated)
	if cancelled["schedule_id"] != third.id {
		t.Errorf("取り消し = %v", cancelled)
	}
	if google.Event(calendarAddr, items[2].Id).Status != "cancelled" || google.Event(calendarAddr, items[0].Id).Status != "confirmed" {
		t.Errorf("回の状態 = %s, %s, want 取り消した回だけ cancelled", google.Event(calendarAddr, items[2].Id).Status, google.Event(calendarAddr, items[0].Id).Status)
	}
	final := list()
	if _, ok := final[days[2]]; ok || final[days[0]].id != before[days[0]].id || final[days[1]].id != second.id || len(final) != 2 {
		t.Errorf("取り消した後の一覧 = %+v", final)
	}
}

// TestRecurringOccurrenceMoveLeftGooglePrimary は、変えた回の予定の職員を替えた後に、元のカレンダーの回を消せなかったとき、
// listSchedules が移した単発の予定と残った元の回を違う id で返し、残った元の回を id で読んで cancelSchedule で取り消せることを確認する。
// 移した単発の予定は、回の id のままである。
func TestRecurringOccurrenceMoveLeftGooglePrimary(t *testing.T) {
	const (
		calendarAddr, companionAddr = "staff@example.com", "companion@example.com"
		newID                       = "01M3TC6CX4Y3D0KCGJ5A9N0WQZ"
	)
	google := &gcaltest.Server{Calendars: map[string][][]*calendarv3.Event{calendarAddr: {nil}, companionAddr: {nil}}}
	h, s := flowRouterOn(organization.SourceGooglePrimary, googleAccounts{gcaltest.Start(t, google)})
	s.Calendars["CAL"] = calendar.ExternalCalendar{ID: "CAL", FacilityID: facilityID, StaffID: staffID, Provider: calendar.ProviderGoogle, CalendarID: calendarAddr}
	s.Calendars["CAL2"] = calendar.ExternalCalendar{ID: "CAL2", FacilityID: facilityID, StaffID: flowCompanionID, Provider: calendar.ProviderGoogle, CalendarID: companionAddr}
	today := civil.Today(time.Now())
	first := civil.DateOf(today.Time().AddDate(0, 0, 7+(8-int(today.Weekday()))%7))
	day := civil.DateOf(first.Time().AddDate(0, 0, 7))
	slot := func(d civil.Date, staff, start, end string) string {
		return `"schedule_type_id":"` + typeID + `","date":"` + d.String() + `","start_time":"` + start + `","end_time":"` + end +
			`","staff_id":"` + staff + `","title":"カンファレンス"`
	}
	request(t, h, http.MethodPost, "/v1/facilities/"+facilityID+"/schedules/recurring",
		`{"id":"`+newID+`",`+slot(first, staffID, "09:00", "10:00")+`,"recurring_rule":{"frequency":"weekly"}}`, http.StatusCreated)
	parentID, err := calendar.EventIDOf(newID)
	if err != nil {
		t.Fatal(err)
	}
	start := time.Date(day.Year, day.Month, day.Day, 9, 0, 0, 0, calendar.Tokyo)
	instance := &calendarv3.Event{
		Id: parentID + "_" + start.UTC().Format("20060102T150405Z"), Status: "confirmed", Summary: "カンファレンス", RecurringEventId: parentID, Etag: `"i1"`,
		OriginalStartTime: &calendarv3.EventDateTime{DateTime: start.Format(time.RFC3339), TimeZone: calendar.TimeZone},
		Start:             &calendarv3.EventDateTime{DateTime: start.Format(time.RFC3339), TimeZone: calendar.TimeZone},
		End:               &calendarv3.EventDateTime{DateTime: start.Add(time.Hour).Format(time.RFC3339), TimeZone: calendar.TimeZone},
	}
	google.Instances = map[string][]*calendarv3.Event{parentID: {instance}}
	onDay := func() []map[string]any {
		got := request(t, h, http.MethodGet, "/v1/facilities/"+facilityID+"/schedules?date_from="+day.String()+"&date_to="+day.String(), "", http.StatusOK)
		var out []map[string]any
		for _, v := range got["schedules"].([]any) {
			out = append(out, v.(map[string]any))
		}
		return out
	}
	listed := onDay()
	if len(listed) != 1 {
		t.Fatalf("回 = %v, want 1 件", listed)
	}
	id := listed[0]["id"].(string)
	changed := request(t, h, http.MethodPut, "/v1/schedules/"+id, `{"etag":`+strconv.Quote(listed[0]["etag"].(string))+`,`+slot(day, staffID, "13:00", "14:00")+`}`, http.StatusOK)

	google.Failures = []int{0, http.StatusInternalServerError}
	moved := request(t, h, http.MethodPut, "/v1/schedules/"+id, `{"etag":`+strconv.Quote(changed["etag"].(string))+`,`+slot(day, flowCompanionID, "13:00", "14:00")+`}`, http.StatusOK)
	if moved["id"] != id || moved["staff_id"] != flowCompanionID || len(google.Events(companionAddr)) != 1 {
		t.Fatalf("移した予定 = %v, 新しいカレンダー = %d 件", moved, len(google.Events(companionAddr)))
	}
	if ev := google.Event(calendarAddr, instance.Id); ev.Status != "confirmed" {
		t.Fatalf("元の回の状態 = %s, want 消せずに残った confirmed", ev.Status)
	}
	listed = onDay()
	ids := map[string]string{}
	for _, sc := range listed {
		ids[sc["staff_id"].(string)] = sc["id"].(string)
	}
	left := ids[staffID]
	if len(listed) != 2 || ids[flowCompanionID] != id || left == "" || left == id {
		t.Fatalf("移した後の一覧 = %v, want 移した予定 %s と、違う id の残った元の回", listed, id)
	}
	read := request(t, h, http.MethodGet, "/v1/schedules/"+left, "", http.StatusOK)
	request(t, h, http.MethodPost, "/v1/schedules/"+left+"/cancel", `{"reason":"重複","etag":`+strconv.Quote(read["etag"].(string))+`}`, http.StatusCreated)
	if ev := google.Event(calendarAddr, instance.Id); ev.Status != "cancelled" {
		t.Errorf("残った元の回の状態 = %s, want cancelled", ev.Status)
	}
	if listed = onDay(); len(listed) != 1 || listed[0]["id"] != id {
		t.Errorf("残った元の回を取り消した後の一覧 = %v, want 移した予定だけ", listed)
	}
}

// TestRecurringUnchangedOccurrenceMoveLeftGooglePrimary は、変えていない回の予定の職員を替えた後に、元のカレンダーの回を消せなかったとき、
// listSchedules が移した単発の予定と、展開した残った元の回を違う id で返すことを確認する。残った元の回は id で読め、updateSchedule で
// 変えられ（変えた回の 409 にならない）、変えた後も id が変わらず、cancelSchedule で取り消せる。移した単発の予定は、回の id のままである。
func TestRecurringUnchangedOccurrenceMoveLeftGooglePrimary(t *testing.T) {
	const (
		calendarAddr, companionAddr = "staff@example.com", "companion@example.com"
		newID                       = "01M3TC6CX4Y3D0KCGJ5A9N0WQZ"
	)
	google := &gcaltest.Server{Calendars: map[string][][]*calendarv3.Event{calendarAddr: {nil}, companionAddr: {nil}}}
	h, s := flowRouterOn(organization.SourceGooglePrimary, googleAccounts{gcaltest.Start(t, google)})
	s.Calendars["CAL"] = calendar.ExternalCalendar{ID: "CAL", FacilityID: facilityID, StaffID: staffID, Provider: calendar.ProviderGoogle, CalendarID: calendarAddr}
	s.Calendars["CAL2"] = calendar.ExternalCalendar{ID: "CAL2", FacilityID: facilityID, StaffID: flowCompanionID, Provider: calendar.ProviderGoogle, CalendarID: companionAddr}
	today := civil.Today(time.Now())
	first := civil.DateOf(today.Time().AddDate(0, 0, 7+(8-int(today.Weekday()))%7))
	day := civil.DateOf(first.Time().AddDate(0, 0, 7))
	slot := func(d civil.Date, staff, start, end string) string {
		return `"schedule_type_id":"` + typeID + `","date":"` + d.String() + `","start_time":"` + start + `","end_time":"` + end +
			`","staff_id":"` + staff + `","title":"カンファレンス"`
	}
	request(t, h, http.MethodPost, "/v1/facilities/"+facilityID+"/schedules/recurring",
		`{"id":"`+newID+`",`+slot(first, staffID, "09:00", "10:00")+`,"recurring_rule":{"frequency":"weekly"}}`, http.StatusCreated)
	parentID, err := calendar.EventIDOf(newID)
	if err != nil {
		t.Fatal(err)
	}
	start := time.Date(day.Year, day.Month, day.Day, 9, 0, 0, 0, calendar.Tokyo)
	instance := &calendarv3.Event{
		Id: parentID + "_" + start.UTC().Format("20060102T150405Z"), Status: "confirmed", Summary: "カンファレンス", RecurringEventId: parentID, Etag: `"i1"`,
		OriginalStartTime: &calendarv3.EventDateTime{DateTime: start.Format(time.RFC3339), TimeZone: calendar.TimeZone},
		Start:             &calendarv3.EventDateTime{DateTime: start.Format(time.RFC3339), TimeZone: calendar.TimeZone},
		End:               &calendarv3.EventDateTime{DateTime: start.Add(time.Hour).Format(time.RFC3339), TimeZone: calendar.TimeZone},
	}
	google.Instances = map[string][]*calendarv3.Event{parentID: {instance}}
	onDay := func() map[string]map[string]any {
		got := request(t, h, http.MethodGet, "/v1/facilities/"+facilityID+"/schedules?date_from="+day.String()+"&date_to="+day.String(), "", http.StatusOK)
		out := map[string]map[string]any{}
		for _, v := range got["schedules"].([]any) {
			sc := v.(map[string]any)
			out[sc["staff_id"].(string)] = sc
		}
		return out
	}
	listed := onDay()[staffID]
	id := listed["id"].(string)

	google.Failures = []int{0, http.StatusInternalServerError}
	moved := request(t, h, http.MethodPut, "/v1/schedules/"+id, `{"etag":`+strconv.Quote(listed["etag"].(string))+`,`+slot(day, flowCompanionID, "09:00", "10:00")+`}`, http.StatusOK)
	if moved["id"] != id || moved["staff_id"] != flowCompanionID || len(google.Events(companionAddr)) != 1 {
		t.Fatalf("移した予定 = %v, 新しいカレンダー = %d 件", moved, len(google.Events(companionAddr)))
	}
	if ev := google.Event(calendarAddr, instance.Id); ev.Status != "confirmed" || len(google.Events(calendarAddr)) != 1 {
		t.Fatalf("元の回 = %+v, 元のカレンダーの予定 = %d 件, want 消せずに残った変えていない回と親の予定だけ", ev, len(google.Events(calendarAddr)))
	}
	byStaff := onDay()
	left := byStaff[staffID]
	if len(byStaff) != 2 || byStaff[flowCompanionID]["id"] != id || left == nil || left["id"] == id {
		t.Fatalf("移した後の一覧 = %v, want 移した予定 %s と、違う id の残った元の回", byStaff, id)
	}
	leftID := left["id"].(string)
	request(t, h, http.MethodGet, "/v1/schedules/"+leftID, "", http.StatusOK)

	changed := request(t, h, http.MethodPut, "/v1/schedules/"+leftID, `{"etag":`+strconv.Quote(left["etag"].(string))+`,`+slot(day, staffID, "13:00", "14:00")+`}`, http.StatusOK)
	if changed["id"] != leftID || changed["start_time"] != "13:00" {
		t.Errorf("残った元の回の変更 = %v", changed)
	}
	if got := onDay()[staffID]; got["id"] != leftID || got["start_time"] != "13:00" {
		t.Errorf("変えた後の残った元の回 = %v, want id %s の 13:00", got, leftID)
	}
	request(t, h, http.MethodPost, "/v1/schedules/"+leftID+"/cancel", `{"reason":"重複","etag":`+strconv.Quote(changed["etag"].(string))+`}`, http.StatusCreated)
	if ev := google.Event(calendarAddr, instance.Id); ev.Status != "cancelled" {
		t.Errorf("残った元の回の状態 = %s, want cancelled", ev.Status)
	}
	if byStaff = onDay(); len(byStaff) != 1 || byStaff[flowCompanionID]["id"] != id {
		t.Errorf("残った元の回を取り消した後の一覧 = %v, want 移した予定だけ", byStaff)
	}
}

// TestRecurringOccurrenceMovedEarlierLeftGooglePrimary は、変えていない回を別の職員の前の週の日付へ移し、元のカレンダーの回を消せなかったとき、
// 元の日付だけで listSchedules を読んでも（移した単発の予定は読む範囲の外になる）、残った元の回が移した予定と違う id で返ることと、
// その id で getSchedule を読むと残った元の回が返ることを確認する。
func TestRecurringOccurrenceMovedEarlierLeftGooglePrimary(t *testing.T) {
	const (
		calendarAddr, companionAddr = "staff@example.com", "companion@example.com"
		newID                       = "01M3TC6CX4Y3D0KCGJ5A9N0WQZ"
	)
	google := &gcaltest.Server{Calendars: map[string][][]*calendarv3.Event{calendarAddr: {nil}, companionAddr: {nil}}}
	h, s := flowRouterOn(organization.SourceGooglePrimary, googleAccounts{gcaltest.Start(t, google)})
	s.Calendars["CAL"] = calendar.ExternalCalendar{ID: "CAL", FacilityID: facilityID, StaffID: staffID, Provider: calendar.ProviderGoogle, CalendarID: calendarAddr}
	s.Calendars["CAL2"] = calendar.ExternalCalendar{ID: "CAL2", FacilityID: facilityID, StaffID: flowCompanionID, Provider: calendar.ProviderGoogle, CalendarID: companionAddr}
	today := civil.Today(time.Now())
	first := civil.DateOf(today.Time().AddDate(0, 0, 7+(8-int(today.Weekday()))%7))
	day := civil.DateOf(first.Time().AddDate(0, 0, 7))
	earlier := civil.DateOf(day.Time().AddDate(0, 0, -6))
	slot := func(d civil.Date, staff string) string {
		return `"schedule_type_id":"` + typeID + `","date":"` + d.String() + `","start_time":"09:00","end_time":"10:00","staff_id":"` + staff + `","title":"カンファレンス"`
	}
	request(t, h, http.MethodPost, "/v1/facilities/"+facilityID+"/schedules/recurring",
		`{"id":"`+newID+`",`+slot(first, staffID)+`,"recurring_rule":{"frequency":"weekly"}}`, http.StatusCreated)
	parentID, err := calendar.EventIDOf(newID)
	if err != nil {
		t.Fatal(err)
	}
	start := time.Date(day.Year, day.Month, day.Day, 9, 0, 0, 0, calendar.Tokyo)
	instance := &calendarv3.Event{
		Id: parentID + "_" + start.UTC().Format("20060102T150405Z"), Status: "confirmed", Summary: "カンファレンス", RecurringEventId: parentID, Etag: `"i1"`,
		OriginalStartTime: &calendarv3.EventDateTime{DateTime: start.Format(time.RFC3339), TimeZone: calendar.TimeZone},
		Start:             &calendarv3.EventDateTime{DateTime: start.Format(time.RFC3339), TimeZone: calendar.TimeZone},
		End:               &calendarv3.EventDateTime{DateTime: start.Add(time.Hour).Format(time.RFC3339), TimeZone: calendar.TimeZone},
	}
	google.Instances = map[string][]*calendarv3.Event{parentID: {instance}}
	onDay := func() []map[string]any {
		got := request(t, h, http.MethodGet, "/v1/facilities/"+facilityID+"/schedules?date_from="+day.String()+"&date_to="+day.String(), "", http.StatusOK)
		var out []map[string]any
		for _, v := range got["schedules"].([]any) {
			out = append(out, v.(map[string]any))
		}
		return out
	}
	listed := onDay()
	if len(listed) != 1 {
		t.Fatalf("回 = %v, want 1 件", listed)
	}
	id := listed[0]["id"].(string)

	google.Failures = []int{0, http.StatusInternalServerError}
	moved := request(t, h, http.MethodPut, "/v1/schedules/"+id, `{"etag":`+strconv.Quote(listed[0]["etag"].(string))+`,`+slot(earlier, flowCompanionID)+`}`, http.StatusOK)
	if moved["id"] != id || moved["date"] != earlier.String() {
		t.Fatalf("移した予定 = %v", moved)
	}
	listed = onDay()
	if len(listed) != 1 || listed[0]["id"] == id || listed[0]["staff_id"] != staffID {
		t.Fatalf("元の日付だけの一覧 = %v, want 移した予定 %s と違う id の残った元の回", listed, id)
	}
	left := listed[0]["id"].(string)
	read := request(t, h, http.MethodGet, "/v1/schedules/"+left, "", http.StatusOK)
	if read["id"] != left || read["staff_id"] != staffID || read["date"] != day.String() {
		t.Errorf("残った元の回の 1 件 = %v", read)
	}
	if got := request(t, h, http.MethodGet, "/v1/schedules/"+id, "", http.StatusOK); got["staff_id"] != flowCompanionID {
		t.Errorf("移した予定の 1 件 = %v", got)
	}
}

// TestRecurringOccurrenceVisitWriteUnknownGooglePrimary は、変えていない回の訪問の情報を初めて変える書き込みの結果が分からず（Google の 5xx）、
// 回の記録に保留の版が残ったとき、一覧の回の id が変わらず、その id の cancelSchedule と updateSchedule が 409（google_write_pending）で、
// Google に書かないことを確認する。
func TestRecurringOccurrenceVisitWriteUnknownGooglePrimary(t *testing.T) {
	const (
		calendarAddr = "staff@example.com"
		newID        = "01M3TC6CX4Y3D0KCGJ5A9N0WQZ"
	)
	google := &gcaltest.Server{Calendars: map[string][][]*calendarv3.Event{calendarAddr: {nil}}}
	h, s := flowRouterOn(organization.SourceGooglePrimary, googleAccounts{gcaltest.Start(t, google)})
	s.Calendars["CAL"] = calendar.ExternalCalendar{ID: "CAL", FacilityID: facilityID, StaffID: staffID, Provider: calendar.ProviderGoogle, CalendarID: calendarAddr}
	today := civil.Today(time.Now())
	first := civil.DateOf(today.Time().AddDate(0, 0, 7+(8-int(today.Weekday()))%7))
	day := civil.DateOf(first.Time().AddDate(0, 0, 7))
	slot := func(d civil.Date, companion string) string {
		v := `"patient_id":"` + flowPatientID + `","assigned_staff_id":"` + staffID + `","service_code_id":"` + flowCodeID + `"`
		if companion != "" {
			v += `,"companion_id":"` + companion + `"`
		}
		return `"schedule_type_id":"` + flowVisitTypeID + `","date":"` + d.String() + `","start_time":"09:00","end_time":"10:00","staff_id":"` + staffID +
			`","visit_info":{` + v + `}`
	}
	request(t, h, http.MethodPost, "/v1/facilities/"+facilityID+"/schedules/recurring",
		`{"id":"`+newID+`",`+slot(first, "")+`,"recurring_rule":{"frequency":"weekly"}}`, http.StatusCreated)
	parentID, err := calendar.EventIDOf(newID)
	if err != nil {
		t.Fatal(err)
	}
	start := time.Date(day.Year, day.Month, day.Day, 9, 0, 0, 0, calendar.Tokyo)
	instance := &calendarv3.Event{
		Id: parentID + "_" + start.UTC().Format("20060102T150405Z"), Status: "confirmed", Summary: google.Event(calendarAddr, parentID).Summary,
		RecurringEventId: parentID, Etag: `"i1"`,
		OriginalStartTime: &calendarv3.EventDateTime{DateTime: start.Format(time.RFC3339), TimeZone: calendar.TimeZone},
		Start:             &calendarv3.EventDateTime{DateTime: start.Format(time.RFC3339), TimeZone: calendar.TimeZone},
		End:               &calendarv3.EventDateTime{DateTime: start.Add(time.Hour).Format(time.RFC3339), TimeZone: calendar.TimeZone},
	}
	google.Instances = map[string][]*calendarv3.Event{parentID: {instance}}
	onDay := func() []map[string]any {
		got := request(t, h, http.MethodGet, "/v1/facilities/"+facilityID+"/schedules?date_from="+day.String()+"&date_to="+day.String(), "", http.StatusOK)
		var out []map[string]any
		for _, v := range got["schedules"].([]any) {
			out = append(out, v.(map[string]any))
		}
		return out
	}
	listed := onDay()
	if len(listed) != 1 {
		t.Fatalf("回 = %v, want 1 件", listed)
	}
	id, etag := listed[0]["id"].(string), strconv.Quote(listed[0]["etag"].(string))

	google.Failures = []int{http.StatusServiceUnavailable}
	got := request(t, h, http.MethodPut, "/v1/schedules/"+id, `{"etag":`+etag+`,`+slot(day, flowCompanionID)+`}`, http.StatusServiceUnavailable)
	if got["code"] != "google_write_unknown" {
		t.Fatalf("訪問の情報を変える書き込み: code = %v", got["code"])
	}
	if r, ok := s.Records[id]; !ok || r.Pending == nil || r.Pending.State != calendar.PendingUnknown {
		t.Fatalf("回の記録 = %+v, ok = %v, want 結果が分からない保留の版", r, ok)
	}
	if listed = onDay(); len(listed) != 1 || listed[0]["id"] != id {
		t.Errorf("保留の版がある回の一覧 = %v, want id %s のまま", listed, id)
	}
	writes := google.Writes()
	if got := request(t, h, http.MethodPost, "/v1/schedules/"+id+"/cancel", `{"reason":"中止","etag":`+etag+`}`, http.StatusConflict); got["code"] != calendarwrite.CodeWritePending {
		t.Errorf("保留の版がある回の取り消し: code = %v", got["code"])
	}
	if got := request(t, h, http.MethodPut, "/v1/schedules/"+id, `{"etag":`+etag+`,`+slot(day, "")+`}`, http.StatusConflict); got["code"] != calendarwrite.CodeWritePending {
		t.Errorf("保留の版がある回の変更: code = %v", got["code"])
	}
	if google.Writes() != writes || google.Event(calendarAddr, instance.Id).Status != "confirmed" {
		t.Errorf("Google への書き込み = %d, want %d", google.Writes(), writes)
	}
}
