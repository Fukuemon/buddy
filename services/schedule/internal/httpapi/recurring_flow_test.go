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
