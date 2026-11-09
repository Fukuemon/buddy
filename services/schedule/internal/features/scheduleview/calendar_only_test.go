package scheduleview_test

import (
	"slices"
	"strings"
	"testing"

	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/schedule"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/scheduleview"
	"github.com/Fukuemon/buddy/services/schedule/internal/inmem"
)

func oct(day int) civil.Date { return civil.Date{Year: 2026, Month: 10, Day: day} }

// thirdWeek は、2026-10-19（月）から 2026-10-25（日）までの週の一覧の条件である。
func thirdWeek() scheduleview.ListQuery {
	from, to := oct(19), oct(25)
	return scheduleview.ListQuery{DateFrom: &from, DateTo: &to}
}

// putAllDay は、カレンダー calendarID の、first から last までの日にかかる終日の予定を Store に入れる。
func putAllDay(s *inmem.Store, calendarID, eventID, title string, first, last civil.Date, edit func(*scheduleview.Projection)) {
	putEvent(s, calendarID, eventID, title, first.Time(), 0, func(p *scheduleview.Projection) {
		end := civil.DateOf(last.Time().AddDate(0, 0, 1))
		p.Start, p.End, p.LastEndDate = scheduleview.ProjectionTime{Date: &first}, scheduleview.ProjectionTime{Date: &end}, &end
		if edit != nil {
			edit(p)
		}
	})
}

// TestSchedulesListGooglePrimaryAllDayEvents は、google_primary の事業所の一覧が、期間に重なる終日の予定を、何日かにわたる予定は
// かかる日の全体で、繰り返しの予定は除く日と置き換えた日と取り消した回を除いた回ごとに返し、予定（Schedules）に入れないことを確認する。
// 見てよくない職員の終日の予定と、予定の種類で絞ったときの終日の予定は返さない（#672）。
func TestSchedulesListGooglePrimaryAllDayEvents(t *testing.T) {
	s := googleStore()
	putAllDay(s, targetCalendarID, "day", "休み", oct(20), oct(20), nil)
	putAllDay(s, targetCalendarID, "span", "研修旅行", oct(17), oct(19), nil)
	putAllDay(s, targetCalendarID, "before", "先週の休み", oct(16), oct(16), nil)
	putAllDay(s, targetCalendarID, "weekly", "在宅勤務", oct(1), oct(1), func(p *scheduleview.Projection) {
		p.Recurrence = []string{"RRULE:FREQ=WEEKLY;BYDAY=TH,FR;UNTIL=20261231", "EXDATE;VALUE=DATE:20261022"}
		p.LastEndDate = nil
	})
	putAllDay(s, targetCalendarID, "weekly_20261023", "", oct(23), oct(23), func(p *scheduleview.Projection) {
		orig := oct(23)
		p.RecurringEventID, p.OriginalStart, p.Status = "weekly", scheduleview.ProjectionTime{Date: &orig}, scheduleview.ProjectionCancelled
		p.Start, p.End = scheduleview.ProjectionTime{}, scheduleview.ProjectionTime{}
	})
	putAllDay(s, ownCalendarID, "own", "自分の休み", oct(21), oct(21), nil)
	putEvent(s, targetCalendarID, "meeting", "カンファレンス", tokyo(10, 20, 9), 60, nil)

	uc := newSchedules(s)
	list, err := uc.List(editorCtx(), facilityID, thirdWeek())
	if err != nil {
		t.Fatal(err)
	}
	var got []string
	ids := map[string]bool{}
	for _, e := range list.AllDayEvents {
		got = append(got, e.StartDate.String()+"〜"+e.EndDate.String()+" "+e.StaffName+" "+e.Title)
		if e.ID == "" || ids[e.ID] {
			t.Errorf("ID %q が空か、重なる", e.ID)
		}
		ids[e.ID] = true
	}
	want := []string{
		"2026-10-17〜2026-10-19 岡田 葵 研修旅行",
		"2026-10-20〜2026-10-20 岡田 葵 休み",
		"2026-10-21〜2026-10-21 閲覧 する 自分の休み",
	}
	if !slices.Equal(got, want) {
		t.Errorf("終日の予定 = %v, want %v", got, want)
	}
	if titles := detailTitles(list.Schedules); !slices.Equal(titles, []string{"カンファレンス"}) {
		t.Errorf("予定 = %v, want [カンファレンス]", titles)
	}

	nov := civil.Date{Year: 2026, Month: 11, Day: 5}
	week := scheduleview.ListQuery{DateFrom: &nov, DateTo: &nov}
	list, err = uc.List(editorCtx(), facilityID, week)
	if err != nil {
		t.Fatal(err)
	}
	if len(list.AllDayEvents) != 1 || list.AllDayEvents[0].Title != "在宅勤務" || list.AllDayEvents[0].StartDate != nov {
		t.Errorf("繰り返しの終日の予定の回 = %+v, want 2026-11-05 の在宅勤務", list.AllDayEvents)
	}

	list, err = uc.List(viewerCtx(), facilityID, thirdWeek())
	if err != nil {
		t.Fatal(err)
	}
	if len(list.AllDayEvents) != 1 || list.AllDayEvents[0].StaffID != viewerID {
		t.Errorf("見てよい職員の終日の予定 = %+v, want 自分の 1 件", list.AllDayEvents)
	}

	q := thirdWeek()
	normal := schedule.Normal
	q.TypeName = &normal
	list, err = uc.List(editorCtx(), facilityID, q)
	if err != nil {
		t.Fatal(err)
	}
	if len(list.AllDayEvents) != 0 || len(list.UnlistedEventCounts) != 0 {
		t.Errorf("種類で絞ったときの終日の予定 = %+v, 件数 = %+v, want 空", list.AllDayEvents, list.UnlistedEventCounts)
	}
}

// TestSchedulesListGooglePrimaryUnlistedCounts は、google_primary の事業所の一覧が、2 日以上にわたる予定、24 時間以上の予定、
// 長さが 0 の予定、日時を読めない予定を、期間に重なる分だけ職員ごとに数え、予定（Schedules）と終日の予定に入れないことを確認する。
// 繰り返しの予定は期間に重なる回を数え、日時のどちらも読めない予定はどの期間でも数え、取り消した予定は数えない（#672）。
func TestSchedulesListGooglePrimaryUnlistedCounts(t *testing.T) {
	s := googleStore()
	putEvent(s, targetCalendarID, "trip", "出張", tokyo(10, 17, 9), 3*24*60, nil)
	putEvent(s, targetCalendarID, "duty", "当直", tokyo(10, 21, 9), 24*60, nil)
	putEvent(s, targetCalendarID, "memo", "メモ", tokyo(10, 22, 9), 0, nil)
	putEvent(s, targetCalendarID, "nostart", "会議", tokyo(10, 23, 9), 60, func(p *scheduleview.Projection) {
		p.Start, p.TimeUnreadable = scheduleview.ProjectionTime{}, true
	})
	putEvent(s, targetCalendarID, "later", "会議", tokyo(10, 30, 9), 60, func(p *scheduleview.Projection) {
		p.End, p.TimeUnreadable = scheduleview.ProjectionTime{}, true
	})
	putEvent(s, ownCalendarID, "neither", "研修", tokyo(10, 1, 9), 60, func(p *scheduleview.Projection) {
		p.Start, p.End, p.TimeUnreadable, p.LastEndDate = scheduleview.ProjectionTime{}, scheduleview.ProjectionTime{}, true, nil
	})
	putEvent(s, ownCalendarID, "camp", "合宿", tokyo(10, 3, 9), 2*24*60, func(p *scheduleview.Projection) {
		p.Recurrence = []string{"RRULE:FREQ=WEEKLY;UNTIL=20261231T235959Z"}
		p.LastEndDate = nil
	})
	putEvent(s, targetCalendarID, "cancelled", "取り消した出張", tokyo(10, 20, 9), 3*24*60, func(p *scheduleview.Projection) {
		p.Status = scheduleview.ProjectionCancelled
	})
	putAllDay(s, targetCalendarID, "day", "休み", oct(20), oct(20), nil)

	list, err := newSchedules(s).List(editorCtx(), facilityID, thirdWeek())
	if err != nil {
		t.Fatal(err)
	}
	// 合宿は 10/17〜10/19 と 10/24〜10/26 の回が重なる
	want := []scheduleview.UnlistedEventCount{{StaffID: staffID, Count: 4}, {StaffID: viewerID, Count: 3}}
	slices.SortFunc(want, func(a, b scheduleview.UnlistedEventCount) int { return strings.Compare(a.StaffID, b.StaffID) })
	if !slices.Equal(list.UnlistedEventCounts, want) {
		t.Errorf("件数 = %+v, want %+v", list.UnlistedEventCounts, want)
	}
	if len(list.Schedules) != 0 || len(list.AllDayEvents) != 1 {
		t.Errorf("予定 = %v, 終日の予定 = %+v, want 予定は無く、終日の予定は 1 件", detailTitles(list.Schedules), list.AllDayEvents)
	}

	far := civil.Date{Year: 2026, Month: 12, Day: 30}
	list, err = newSchedules(s).List(editorCtx(), facilityID, scheduleview.ListQuery{DateFrom: &far, DateTo: &far})
	if err != nil {
		t.Fatal(err)
	}
	if !slices.Equal(list.UnlistedEventCounts, []scheduleview.UnlistedEventCount{{StaffID: viewerID, Count: 1}}) {
		t.Errorf("日時を読めない予定だけの期間の件数 = %+v, want 閲覧する職員の 1 件", list.UnlistedEventCounts)
	}

	list, err = newSchedules(s).List(viewerCtx(), facilityID, thirdWeek())
	if err != nil {
		t.Fatal(err)
	}
	if !slices.Equal(list.UnlistedEventCounts, []scheduleview.UnlistedEventCount{{StaffID: viewerID, Count: 3}}) {
		t.Errorf("見てよい職員の件数 = %+v, want 自分の 3 件", list.UnlistedEventCounts)
	}
}

// TestSchedulesListGooglePrimaryAllDayRecurrence は、繰り返しの終日の予定の、変えた回を変えた日にその回の ID で返し、
// buddy の規則に写せない繰り返し（毎年）を、回が期間に重なりうる間は最初の回の 1 件にし、終わった後は返さないことを確認する（#672）。
func TestSchedulesListGooglePrimaryAllDayRecurrence(t *testing.T) {
	s := googleStore()
	putAllDay(s, targetCalendarID, "weekly", "在宅勤務", oct(5), oct(5), func(p *scheduleview.Projection) {
		p.Recurrence = []string{"RRULE:FREQ=WEEKLY;UNTIL=20261231"}
		p.LastEndDate = nil
	})
	putAllDay(s, targetCalendarID, "weekly_20261019", "在宅勤務（変更）", oct(21), oct(21), func(p *scheduleview.Projection) {
		orig := oct(19)
		p.RecurringEventID, p.OriginalStart = "weekly", scheduleview.ProjectionTime{Date: &orig}
	})
	putAllDay(s, targetCalendarID, "yearly", "創立記念日", oct(1), oct(1), func(p *scheduleview.Projection) {
		p.Recurrence = []string{"RRULE:FREQ=YEARLY;UNTIL=20261031"}
		end := oct(31)
		p.LastEndDate = &end
	})

	uc := newSchedules(s)
	list, err := uc.List(editorCtx(), facilityID, thirdWeek())
	if err != nil {
		t.Fatal(err)
	}
	var got []string
	for _, e := range list.AllDayEvents {
		got = append(got, e.StartDate.String()+" "+e.Title)
	}
	want := []string{"2026-10-01 創立記念日", "2026-10-21 在宅勤務（変更）"}
	if !slices.Equal(got, want) {
		t.Errorf("終日の予定 = %v, want %v", got, want)
	}
	if id := list.AllDayEvents[1].ID; id != scheduleview.OccurrenceScheduleID(targetCalendarID, "weekly", oct(19)) {
		t.Errorf("変えた回の ID = %s", id)
	}

	nov := civil.Date{Year: 2026, Month: 11, Day: 2}
	list, err = uc.List(editorCtx(), facilityID, scheduleview.ListQuery{DateFrom: &nov, DateTo: &nov})
	if err != nil {
		t.Fatal(err)
	}
	if len(list.AllDayEvents) != 1 || list.AllDayEvents[0].Title != "在宅勤務" {
		t.Errorf("写せない繰り返しが終わった後の終日の予定 = %+v, want 在宅勤務の回だけ", list.AllDayEvents)
	}
}

// TestSchedulesListBuddyPrimaryHasNoCalendarOnly は、buddy_primary の事業所の一覧が、終日の予定と件数を空で返すことを確認する（#672）。
func TestSchedulesListBuddyPrimaryHasNoCalendarOnly(t *testing.T) {
	list, err := newSchedules(inmem.Seeded()).List(editorCtx(), facilityID, thirdWeek())
	if err != nil {
		t.Fatal(err)
	}
	if list.AllDayEvents == nil || len(list.AllDayEvents) != 0 || list.UnlistedEventCounts == nil || len(list.UnlistedEventCounts) != 0 {
		t.Errorf("終日の予定 = %#v, 件数 = %#v, want 空", list.AllDayEvents, list.UnlistedEventCounts)
	}
}

func detailTitles(ds []scheduleview.Detail) []string {
	var out []string
	for _, d := range ds {
		if d.Title != nil {
			out = append(out, *d.Title)
		}
	}
	return out
}
