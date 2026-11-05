package calendar_test

import (
	"regexp"
	"slices"
	"testing"

	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendar"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/schedule"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/scheduleview"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/visit"
)

func TestEventIDOf(t *testing.T) {
	a, err := calendar.EventIDOf("01K8AAAAAAAAAAAAAAAAAAAAAA")
	if err != nil {
		t.Fatal(err)
	}
	if !regexp.MustCompile(`^[a-v0-9]{26}$`).MatchString(a) {
		t.Errorf("Google の予定の ID の形でない: %q", a)
	}
	if b, _ := calendar.EventIDOf("01K8AAAAAAAAAAAAAAAAAAAAAA"); a != b {
		t.Errorf("同じ予定から違う ID: %q, %q", a, b)
	}
	if b, _ := calendar.EventIDOf("01K8AAAAAAAAAAAAAAAAAAAAAB"); a == b {
		t.Errorf("違う予定から同じ ID: %q", a)
	}
	if _, err := calendar.EventIDOf("NEW000"); err == nil {
		t.Error("ULID でない ID を受けた")
	}
}

func TestScheduleBodyVisitTitle(t *testing.T) {
	d := scheduleview.Detail{
		Schedule: schedule.Schedule{ID: "S", Slot: schedule.Slot{
			Date: civil.Date{Year: 2026, Month: 11, Day: 4}, StartTime: civil.Time{Hour: 9, Minute: 30}, EndTime: civil.Time{Hour: 10},
		}},
		Visit: &visit.Detail{ServiceCode: "訪看I2", PatientName: "利用者A"},
	}
	b := calendar.ScheduleBody(d)
	if b.Summary != "【訪看I2】利用者A" {
		t.Errorf("タイトル = %q", b.Summary)
	}
	if b.Start.DateTime != "2026-11-04T09:30:00" || b.End.DateTime != "2026-11-04T10:00:00" || b.Start.TimeZone != "Asia/Tokyo" {
		t.Errorf("日時 = %+v, %+v", b.Start, b.End)
	}
	if b.Description != nil || len(b.Recurrence) != 0 {
		t.Errorf("説明か繰り返しがある: %+v", b)
	}
}

// TestBodyEndsNextDay は、終了が翌日の予定と繰り返しの予定の終了の日時を、予定の日付の翌日から作ることを確認する（ADR-0022）。
func TestBodyEndsNextDay(t *testing.T) {
	title := "夜勤"
	slot := schedule.Slot{
		Date: civil.Date{Year: 2026, Month: 11, Day: 30}, StartTime: civil.Time{Hour: 22}, EndTime: civil.Time{Hour: 1}, EndsNextDay: true,
		Title: &title,
	}
	single := calendar.ScheduleBody(scheduleview.Detail{Schedule: schedule.Schedule{ID: "S", Slot: slot}})
	recurring := calendar.RecurringBody(scheduleview.RecurringDetail{
		RecurringSchedule: schedule.RecurringSchedule{ID: "R", Slot: slot, Rule: schedule.Rule{Frequency: schedule.Weekly}},
	}, nil)
	for name, b := range map[string]calendar.EventBody{"単発": single, "繰り返し": recurring} {
		if b.Start.DateTime != "2026-11-30T22:00:00" || b.End.DateTime != "2026-12-01T01:00:00" || b.End.TimeZone != "Asia/Tokyo" {
			t.Errorf("%s の日時 = %+v, %+v", name, b.Start, b.End)
		}
	}
}

func intp(v int) *int { return &v }

// TestRecurrenceOfRoundTrip は、buddy の規則を RRULE にして読み戻すと、同じ規則と除外の日になることを確認する。
func TestRecurrenceOfRoundTrip(t *testing.T) {
	first := civil.Date{Year: 2026, Month: 11, Day: 10} // 火曜で、11 月の第 2 週
	end := civil.Date{Year: 2027, Month: 3, Day: 31}
	tests := []struct {
		name string
		rule schedule.Rule
		want string
	}{
		{"毎週（曜日なし）", schedule.Rule{Frequency: schedule.Weekly}, "RRULE:FREQ=WEEKLY;BYDAY=TU"},
		{"毎週の曜日", schedule.Rule{Frequency: schedule.Weekly, DayOfWeek: intp(2), EndDate: &end}, "RRULE:FREQ=WEEKLY;BYDAY=TU;UNTIL=20270331T145959Z"},
		{"毎月の日", schedule.Rule{Frequency: schedule.Monthly, DayOfMonth: intp(10)}, "RRULE:FREQ=MONTHLY;BYMONTHDAY=10"},
		{"毎月（日なし）", schedule.Rule{Frequency: schedule.Monthly}, "RRULE:FREQ=MONTHLY;BYMONTHDAY=10"},
		{"毎月の第何週の曜日", schedule.Rule{Frequency: schedule.Monthly, WeekOfMonth: intp(2), DayOfWeek: intp(2)}, "RRULE:FREQ=MONTHLY;BYDAY=2TU"},
	}
	exdates := []civil.Date{{Year: 2026, Month: 12, Day: 8}, {Year: 2026, Month: 11, Day: 17}}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rs := schedule.RecurringSchedule{Slot: schedule.Slot{Date: first, StartTime: civil.Time{Hour: 9}, EndTime: civil.Time{Hour: 10}}, Rule: tt.rule}
			lines := calendar.RecurrenceOf(rs, exdates)
			if lines[0] != tt.want {
				t.Errorf("RRULE = %q, want %q", lines[0], tt.want)
			}
			if tt.name == "毎月の日" && lines[1] != "EXDATE;TZID=Asia/Tokyo:20261117T090000,20261208T090000" {
				t.Errorf("EXDATE = %q", lines[1])
			}
			got, err := calendar.RuleFromRecurrence(calendar.Event{
				Start:      calendar.When{DateTime: "2026-11-10T09:00:00+09:00", TimeZone: calendar.TimeZone},
				Recurrence: lines,
			})
			if err != nil {
				t.Fatal(err)
			}
			if !rs.HasOccurrenceOn(first) {
				t.Fatal("最初の日付が回に当たらない")
			}
			for d := first; d.Before(civil.Date{Year: 2027, Month: 6, Day: 1}); d = civil.DateOf(d.Time().AddDate(0, 0, 1)) {
				back := schedule.RecurringSchedule{Slot: rs.Slot, Rule: got.Rule}
				if rs.HasOccurrenceOn(d) != back.HasOccurrenceOn(d) {
					t.Fatalf("%s の回が食い違う: 元 %v、読み戻し %v", d, rs.HasOccurrenceOn(d), back.HasOccurrenceOn(d))
				}
			}
			want := []civil.Date{exdates[1], exdates[0]}
			if !slices.Equal(got.ExclusionDates, want) {
				t.Errorf("除外の日 = %v", got.ExclusionDates)
			}
		})
	}
}
