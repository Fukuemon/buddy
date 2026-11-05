package scheduleview_test

import (
	"errors"
	"reflect"
	"regexp"
	"slices"
	"testing"
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendar"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendarimport"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendarsync"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/schedule"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/scheduleview"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/servicecode"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/staff"
	"github.com/Fukuemon/buddy/services/schedule/internal/inmem"
)

func TestSchedulesList(t *testing.T) {
	s := inmem.Seeded()
	uc := newSchedules(s)
	ctx := editorCtx()
	from, to := civil.Date{Year: 2026, Month: 10, Day: 20}, civil.Date{Year: 2026, Month: 10, Day: 1}
	if _, err := uc.List(ctx, facilityID, scheduleview.ListQuery{DateFrom: &from, DateTo: &to}); !errors.Is(err, apperr.ErrInvalidInput) {
		t.Fatalf("err = %v, want ErrInvalidInput", err)
	}
	if _, err := uc.List(ctx, "MISSING", scheduleview.ListQuery{}); !errors.Is(err, apperr.ErrNotFound) {
		t.Fatalf("err = %v, want ErrNotFound", err)
	}
}

// TestSchedulesListContents は、一覧が、事業所の単発の予定と繰り返しの予定を、Get と GetRecurring と同じ枠、種類、更新の番号で返し、ほかの事業所の予定を返さないことを確認する。
func TestSchedulesListContents(t *testing.T) {
	s := inmem.Seeded()
	uc := newSchedules(s)
	ctx := editorCtx()
	single, err := uc.Create(ctx, facilityID, visitSlot(validVisit()))
	if err != nil {
		t.Fatal(err)
	}
	recurring, err := uc.CreateRecurring(ctx, facilityID, normalSlot(), schedule.RuleInput{Frequency: schedule.Weekly})
	if err != nil {
		t.Fatal(err)
	}
	const otherScheduleID, otherRecurringID = "OTHER-SCHEDULE", "OTHER-RECURRING"
	otherSlot := schedule.Slot{FacilityID: otherFacilityID, StaffID: otherStaffID, TypeID: normalTypeID, Date: civil.Date{Year: 2026, Month: 10, Day: 20}}
	s.Schedules[otherScheduleID] = scheduleview.Detail{Schedule: schedule.Schedule{ID: otherScheduleID, Slot: otherSlot}}
	s.Recurring[otherRecurringID] = scheduleview.RecurringDetail{RecurringSchedule: schedule.RecurringSchedule{ID: otherRecurringID, Slot: otherSlot}}

	list, err := uc.List(ctx, facilityID, scheduleview.ListQuery{})
	if err != nil {
		t.Fatal(err)
	}
	if ids := scheduleIDs(list.Schedules); !slices.Equal(ids, []string{single.ID}) {
		t.Errorf("単発の予定 = %v, want [%s]", ids, single.ID)
	}
	for _, d := range list.Schedules {
		want, err := uc.Get(ctx, d.ID)
		if err != nil {
			t.Fatal(err)
		}
		if !reflect.DeepEqual(d.Schedule, want.Schedule) || d.TypeName != want.TypeName || d.Version != want.Version {
			t.Errorf("一覧の予定 = %+v, Get = %+v", d, want)
		}
	}
	ids := make([]string, 0, len(list.RecurringSchedules))
	for _, d := range list.RecurringSchedules {
		ids = append(ids, d.ID)
		want, err := uc.GetRecurring(ctx, d.ID)
		if err != nil {
			t.Fatal(err)
		}
		if !reflect.DeepEqual(d.RecurringSchedule, want.RecurringSchedule) || d.TypeName != want.TypeName || d.Version != want.Version {
			t.Errorf("一覧の繰り返しの予定 = %+v, GetRecurring = %+v", d, want)
		}
	}
	slices.Sort(ids)
	if want := []string{recurring.ID, recurringID}; !slices.Equal(ids, slices.Sorted(slices.Values(want))) {
		t.Errorf("繰り返しの予定 = %v, want %v", ids, want)
	}
}

func scheduleIDs(ds []scheduleview.Detail) []string {
	ids := make([]string, len(ds))
	for i, d := range ds {
		ids[i] = d.ID
	}
	slices.Sort(ids)
	return ids
}

// TestSchedulesListBuddyPrimaryIgnoresProjections は、buddy を正本にする事業所（buddy_primary）の一覧が、
// 結び付けたカレンダーに Projection の行があっても、buddy の予定のテーブルの予定だけを返すことを確認する。
func TestSchedulesListBuddyPrimaryIgnoresProjections(t *testing.T) {
	s := inmem.Seeded()
	uc := newSchedules(s)
	ctx := editorCtx()
	single, err := uc.Create(ctx, facilityID, normalSlot())
	if err != nil {
		t.Fatal(err)
	}
	const calendarID = "CALENDAR"
	s.Calendars[calendarID] = calendar.ExternalCalendar{ID: calendarID, FacilityID: facilityID, StaffID: staffID, Provider: calendar.ProviderGoogle}
	at := time.Date(2026, 10, 20, 9, 0, 0, 0, calendar.Tokyo)
	end := at.Add(time.Hour)
	s.Projections[inmem.ProjectionKey{ExternalCalendarID: calendarID, EventID: "event-1"}] = scheduleview.Projection{
		ExternalCalendarID: calendarID, EventID: "event-1", FacilityID: facilityID, StaffID: staffID,
		Status: scheduleview.ProjectionConfirmed, Title: "Google の予定", Start: scheduleview.ProjectionTime{At: &at}, End: scheduleview.ProjectionTime{At: &end},
	}
	from, to := civil.Date{Year: 2026, Month: 10, Day: 1}, civil.Date{Year: 2026, Month: 10, Day: 31}
	for _, q := range []scheduleview.ListQuery{{}, {DateFrom: &from, DateTo: &to}} {
		list, err := uc.List(ctx, facilityID, q)
		if err != nil {
			t.Fatal(err)
		}
		if ids := scheduleIDs(list.Schedules); !slices.Equal(ids, []string{single.ID}) {
			t.Errorf("%+v: 単発の予定 = %v, want [%s]", q, ids, single.ID)
		}
		if len(list.RecurringSchedules) != 1 || list.RecurringSchedules[0].ID != recurringID {
			t.Errorf("%+v: 繰り返しの予定 = %+v, want [%s]", q, list.RecurringSchedules, recurringID)
		}
		got, err := uc.Get(ctx, single.ID)
		if err != nil {
			t.Fatal(err)
		}
		if !reflect.DeepEqual(list.Schedules[0], got) {
			t.Errorf("%+v: 一覧の予定 = %+v, Get = %+v", q, list.Schedules[0], got)
		}
	}
}

const (
	targetCalendarID   = "CAL-TARGET"
	ownCalendarID      = "CAL-OWN"
	disabledCalendarID = "CAL-DISABLED"
	otherCalendarID    = "CAL-OTHER"
	visitCode          = "訪看I2"
	patientName        = "山田 花子"
)

// googleStore は、authzStore の事業所を google_primary にし、予定の職員 staffID、閲覧する職員 viewerID、外したカレンダーの職員 companionID、
// ほかの事業所の職員 otherStaffID にカレンダーを結び付けた Store を返す。buddy の予定のテーブルの予定は読まれないことを確認するため残す。
func googleStore() *inmem.Store {
	s := authzStore()
	f := s.Facilities[facilityID]
	f.SourceMode = organization.SourceGooglePrimary
	s.Facilities[facilityID] = f
	for id, name := range map[string]string{staffID: "岡田 葵", viewerID: "閲覧 する", companionID: "外した 職員", otherStaffID: "ほかの 事業所"} {
		d := s.Staff[id]
		d.Username = name
		s.Staff[id] = d
	}
	disabled := time.Date(2026, 10, 1, 0, 0, 0, 0, time.UTC)
	s.Calendars[targetCalendarID] = calendar.ExternalCalendar{ID: targetCalendarID, FacilityID: facilityID, StaffID: staffID, Provider: calendar.ProviderGoogle}
	s.Calendars[ownCalendarID] = calendar.ExternalCalendar{ID: ownCalendarID, FacilityID: facilityID, StaffID: viewerID, Provider: calendar.ProviderGoogle}
	s.Calendars[disabledCalendarID] = calendar.ExternalCalendar{ID: disabledCalendarID, FacilityID: facilityID, StaffID: companionID, Provider: calendar.ProviderGoogle, DisabledAt: &disabled}
	s.Calendars[otherCalendarID] = calendar.ExternalCalendar{ID: otherCalendarID, FacilityID: otherFacilityID, StaffID: otherStaffID, Provider: calendar.ProviderGoogle}
	p := s.Patients[patientID]
	p.Name = patientName
	s.Patients[patientID] = p
	s.Codes[codeID] = servicecode.ServiceCode{ID: codeID, Code: visitCode}
	return s
}

// putEvent は、カレンダー calendarID の、Asia/Tokyo の start に始まり minutes 分の予定を Store に入れる。
func putEvent(s *inmem.Store, calendarID, eventID, title string, start time.Time, minutes int, edit func(*scheduleview.Projection)) {
	c := s.Calendars[calendarID]
	end := start.Add(time.Duration(minutes) * time.Minute)
	endDay := civil.Today(end)
	p := scheduleview.Projection{
		ExternalCalendarID: calendarID, EventID: eventID, FacilityID: c.FacilityID, StaffID: c.StaffID,
		Status: scheduleview.ProjectionConfirmed, Title: title, Start: scheduleview.ProjectionTime{At: &start}, End: scheduleview.ProjectionTime{At: &end},
		TimeZone: calendar.TimeZone, ETag: `"` + eventID + `"`, LastEndDate: &endDay, ProjectedAt: start,
	}
	if edit != nil {
		edit(&p)
	}
	s.Projections[inmem.ProjectionKey{ExternalCalendarID: calendarID, EventID: eventID}] = p
}

func tokyo(month time.Month, day, hour int) time.Time {
	return time.Date(2026, month, day, hour, 0, 0, 0, calendar.Tokyo)
}

func october() scheduleview.ListQuery {
	from, to := civil.Date{Year: 2026, Month: 10, Day: 1}, civil.Date{Year: 2026, Month: 10, Day: 31}
	return scheduleview.ListQuery{DateFrom: &from, DateTo: &to}
}

// TestSchedulesListGooglePrimaryReadable は、google_primary の事業所の一覧が、Projection の予定を、カレンダーの職員を予定の職員とみなした
// 閲覧の判定で絞り、外したカレンダーの行とほかの事業所の行を返さず、見てよい職員のカレンダーの同期の状況を返すことを確認する。
func TestSchedulesListGooglePrimaryReadable(t *testing.T) {
	tests := []struct {
		name      string
		grants    []staff.PolicyGrant
		wantStaff []string
	}{
		{"権限なし", nil, []string{viewerID}},
		{"指定したチームの閲覧", []staff.PolicyGrant{{PolicyCode: organization.ScheduleTeamRead, TargetTeamIDs: []string{targetTeam}}}, []string{staffID, viewerID}},
		{"全ての閲覧", []staff.PolicyGrant{{PolicyCode: organization.ScheduleAllRead}}, []string{staffID, viewerID}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := googleStore()
			putEvent(s, targetCalendarID, "target", "カンファレンス", tokyo(10, 20, 9), 60, nil)
			putEvent(s, ownCalendarID, "own", "研修", tokyo(10, 20, 13), 60, nil)
			putEvent(s, disabledCalendarID, "disabled", "外したカレンダーの予定", tokyo(10, 20, 15), 60, nil)
			putEvent(s, otherCalendarID, "other", "ほかの事業所の予定", tokyo(10, 20, 15), 60, nil)
			s.SyncResults[targetCalendarID] = calendarsync.SyncResult{Status: calendarsync.SyncSucceeded}
			s.SyncedAt[targetCalendarID] = tokyo(10, 20, 8)

			list, err := newSchedules(s).List(viewerCtx(tt.grants...), facilityID, october())
			if err != nil {
				t.Fatal(err)
			}
			if list.SourceMode != organization.SourceGooglePrimary || len(list.RecurringSchedules) != 0 {
				t.Errorf("SourceMode = %s, 繰り返しの予定 = %d 件", list.SourceMode, len(list.RecurringSchedules))
			}
			var staffIDs []string
			for _, d := range list.Schedules {
				staffIDs = append(staffIDs, d.StaffID)
				if d.Source != scheduleview.SourceGoogleCalendar || d.FacilityID != facilityID || d.ReviewReason != "" || d.TypeName != schedule.Normal {
					t.Errorf("予定 = %+v", d)
				}
			}
			slices.Sort(staffIDs)
			if !slices.Equal(staffIDs, tt.wantStaff) {
				t.Errorf("予定の職員 = %v, want %v", staffIDs, tt.wantStaff)
			}
			var syncStaff []string
			for _, c := range list.CalendarSyncs {
				syncStaff = append(syncStaff, c.StaffID)
				if c.StaffID == staffID && (c.LastStatus != scheduleview.SyncSucceeded || c.LastSucceededAt == nil || c.StaffName != "岡田 葵") {
					t.Errorf("同期の状況 = %+v", c)
				}
				if c.StaffID == viewerID && (c.LastStatus != scheduleview.SyncNever || c.LastSucceededAt != nil) {
					t.Errorf("同期していないカレンダーの状況 = %+v", c)
				}
			}
			slices.Sort(syncStaff)
			if !slices.Equal(syncStaff, tt.wantStaff) {
				t.Errorf("同期の状況の職員 = %v, want %v", syncStaff, tt.wantStaff)
			}
		})
	}
}

// TestSchedulesListGooglePrimaryExpandsRecurrence は、繰り返しの親を期間の回に展開し、除外する日と、例外の回が置き換えた元の日と、
// 取り消した回を除き、変えた回を変えた日時で返すことを確認する。前の日に始まり期間の初日に終わる予定も返し、
// 回の ID は ULID の形で、読み直しても変わらないことも確認する。
func TestSchedulesListGooglePrimaryExpandsRecurrence(t *testing.T) {
	s := googleStore()
	putEvent(s, targetCalendarID, "weekly", "定例", tokyo(10, 5, 9), 60, func(p *scheduleview.Projection) {
		p.Recurrence = []string{"RRULE:FREQ=WEEKLY;UNTIL=20261231T235959Z", "EXDATE;TZID=Asia/Tokyo:20261012T090000"}
		p.LastEndDate = nil
	})
	putEvent(s, targetCalendarID, "weekly_20261019", "定例（変更）", tokyo(10, 20, 11), 60, func(p *scheduleview.Projection) {
		orig := tokyo(10, 19, 9)
		p.RecurringEventID, p.OriginalStart = "weekly", scheduleview.ProjectionTime{At: &orig}
	})
	putEvent(s, targetCalendarID, "weekly_20261026", "", tokyo(10, 26, 9), 60, func(p *scheduleview.Projection) {
		orig := tokyo(10, 26, 9)
		p.RecurringEventID, p.OriginalStart, p.Status = "weekly", scheduleview.ProjectionTime{At: &orig}, scheduleview.ProjectionCancelled
		p.Start, p.End = scheduleview.ProjectionTime{}, scheduleview.ProjectionTime{}
	})
	putEvent(s, targetCalendarID, "overnight", "夜勤", tokyo(9, 30, 22), 240, nil)
	putEvent(s, targetCalendarID, "allday", "休み", tokyo(10, 21, 0), 0, func(p *scheduleview.Projection) {
		d, next := civil.Date{Year: 2026, Month: 10, Day: 21}, civil.Date{Year: 2026, Month: 10, Day: 22}
		p.Start, p.End = scheduleview.ProjectionTime{Date: &d}, scheduleview.ProjectionTime{Date: &next}
	})

	uc := newSchedules(s)
	list, err := uc.List(editorCtx(), facilityID, october())
	if err != nil {
		t.Fatal(err)
	}
	var got []string
	ids := map[string]bool{}
	for _, d := range list.Schedules {
		got = append(got, d.Date.String()+" "+d.StartTime.String()+" "+*d.Title)
		if !ulidPattern.MatchString(d.ID) || ids[d.ID] {
			t.Errorf("ID %q が ULID の形でないか、重なる", d.ID)
		}
		ids[d.ID] = true
	}
	want := []string{"2026-09-30 22:00 夜勤", "2026-10-05 09:00 定例", "2026-10-20 11:00 定例（変更）"}
	if !slices.Equal(got, want) {
		t.Errorf("予定 = %v, want %v", got, want)
	}
	again, err := uc.List(editorCtx(), facilityID, october())
	if err != nil {
		t.Fatal(err)
	}
	if !slices.Equal(scheduleIDs(again.Schedules), scheduleIDs(list.Schedules)) {
		t.Errorf("読み直した ID = %v, want %v", scheduleIDs(again.Schedules), scheduleIDs(list.Schedules))
	}
}

var ulidPattern = regexp.MustCompile(`^[0-7][0-9A-HJKMNP-TV-Z]{25}$`)

// TestSchedulesListGooglePrimaryReviewReasons は、buddy の繰り返しの規則に写せない繰り返しの予定を、期間の外の最初の回でも 1 件で返し、
// 訪問の情報を引けない予定を、訪問の情報を空にした通常の予定にして理由を付けて返し、引けた予定に訪問の情報を付けることを確認する。
func TestSchedulesListGooglePrimaryReviewReasons(t *testing.T) {
	s := googleStore()
	putEvent(s, targetCalendarID, "biweekly", "隔週の会議", tokyo(9, 7, 10), 60, func(p *scheduleview.Projection) {
		p.Recurrence = []string{"RRULE:FREQ=WEEKLY;INTERVAL=2"}
		p.LastEndDate = nil
	})
	putEvent(s, targetCalendarID, "visit", "【"+visitCode+"】"+patientName, tokyo(10, 20, 9), 60, nil)
	putEvent(s, targetCalendarID, "nopatient", "【"+visitCode+"】いない 利用者", tokyo(10, 20, 11), 60, nil)
	putEvent(s, targetCalendarID, "nocode", "【訪看X9】"+patientName, tokyo(10, 20, 13), 60, nil)
	putEvent(s, targetCalendarID, "badtitle", "【訪看I2】", tokyo(10, 20, 15), 60, nil)

	list, err := newSchedules(s).List(editorCtx(), facilityID, october())
	if err != nil {
		t.Fatal(err)
	}
	got := map[string]scheduleview.Detail{}
	for _, d := range list.Schedules {
		got[d.Date.String()+" "+d.StartTime.String()] = d
	}
	if len(got) != 5 {
		t.Fatalf("予定 = %d 件, want 5: %+v", len(got), list.Schedules)
	}
	reviews := map[string]scheduleview.ReviewReason{
		"2026-09-07 10:00": scheduleview.ReviewRecurrenceUnsupported,
		"2026-10-20 11:00": scheduleview.ReviewPatientNotFound,
		"2026-10-20 13:00": scheduleview.ReviewServiceCodeNotFound,
		"2026-10-20 15:00": scheduleview.ReviewTitleUnreadable,
	}
	for key, reason := range reviews {
		d := got[key]
		if d.ReviewReason != reason || d.Visit != nil || d.TypeName != schedule.Normal || d.Title == nil {
			t.Errorf("%s: ReviewReason = %q, Visit = %+v, TypeName = %s, Title = %v, want %q の通常の予定", key, d.ReviewReason, d.Visit, d.TypeName, d.Title, reason)
		}
	}
	v := got["2026-10-20 09:00"]
	if v.ReviewReason != "" || v.TypeName != schedule.Visit || v.TypeID != visitTypeID || v.Title != nil || v.Visit == nil ||
		v.Visit.PatientID != patientID || v.Visit.PatientName != patientName || v.Visit.ServiceCodeID != codeID || v.Visit.AssignedStaffID != staffID {
		t.Errorf("訪問の予定 = %+v, Visit = %+v", v, v.Visit)
	}
}

// TestSchedulesListGooglePrimaryCutover は、google_primary の事業所の一覧が、open の切り替えの間だけ切り替えを返し、
// 切り替えの間も Projection を読むことを確認する（ADR-0031）。
func TestSchedulesListGooglePrimaryCutover(t *testing.T) {
	s := googleStore()
	putEvent(s, ownCalendarID, "own", "研修", tokyo(10, 20, 13), 60, nil)
	list, err := newSchedules(s).List(viewerCtx(), facilityID, october())
	if err != nil {
		t.Fatal(err)
	}
	if list.Cutover != nil {
		t.Errorf("切り替えの前 = %+v, want nil", list.Cutover)
	}
	started := tokyo(10, 5, 9)
	s.Cutovers["CUT"] = calendarimport.Cutover{
		ID: "CUT", FacilityID: facilityID, Status: calendarimport.CutoverOpen, RangeStart: civil.Date{Year: 2026, Month: 10, Day: 1}, StartedAt: started,
	}
	s.Cutovers["OLD"] = calendarimport.Cutover{ID: "OLD", FacilityID: facilityID, Status: calendarimport.CutoverCanceled}
	list, err = newSchedules(s).List(viewerCtx(), facilityID, october())
	if err != nil {
		t.Fatal(err)
	}
	if list.Cutover == nil || !list.Cutover.StartedAt.Equal(started) || list.Cutover.RangeStart != (civil.Date{Year: 2026, Month: 10, Day: 1}) {
		t.Errorf("切り替え = %+v", list.Cutover)
	}
	if len(list.Schedules) != 1 || list.Schedules[0].Source != scheduleview.SourceGoogleCalendar {
		t.Errorf("予定 = %+v, want 切り替えの間も Projection を読む", list.Schedules)
	}
}
