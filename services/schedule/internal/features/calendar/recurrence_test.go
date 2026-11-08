package calendar_test

import (
	"errors"
	"fmt"
	"reflect"
	"testing"

	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendar"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/schedule"
)

func ptr[T any](v T) *T { return &v }

func TestRuleFromRecurrence(t *testing.T) {
	const tue = 2
	tests := []struct {
		name    string
		lines   []string
		first   string
		start   civil.Time
		when    *calendar.When
		want    schedule.Rule
		end     string
		exdates []string
		expand  bool
	}{
		{
			name: "毎週の曜日", lines: []string{"RRULE:FREQ=WEEKLY;BYDAY=TU"}, first: "2026-10-20",
			want: schedule.Rule{Frequency: schedule.Weekly, DaysOfWeek: []int{tue}, Interval: 1},
		},
		{
			name: "毎週の INTERVAL=1 と WKST", lines: []string{"RRULE:FREQ=WEEKLY;WKST=SU;INTERVAL=1;BYDAY=TU"}, first: "2026-10-20",
			want: schedule.Rule{Frequency: schedule.Weekly, DaysOfWeek: []int{tue}, Interval: 1},
		},
		{
			name: "BYDAY の無い毎週", lines: []string{"RRULE:FREQ=WEEKLY"}, first: "2026-10-20",
			want: schedule.Rule{Frequency: schedule.Weekly, DaysOfWeek: []int{tue}, Interval: 1},
		},
		{
			name: "隔週", lines: []string{"RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=TU"}, first: "2026-10-20",
			want: schedule.Rule{Frequency: schedule.Weekly, DaysOfWeek: []int{tue}, Interval: 2},
		},
		{
			name: "52 週ごと", lines: []string{"RRULE:FREQ=WEEKLY;INTERVAL=52"}, first: "2026-10-20",
			want: schedule.Rule{Frequency: schedule.Weekly, DaysOfWeek: []int{tue}, Interval: 52},
		},
		{
			name: "複数の曜日を月曜からの順に並べる", lines: []string{"RRULE:FREQ=WEEKLY;BYDAY=TH,TU"}, first: "2026-10-20",
			want: schedule.Rule{Frequency: schedule.Weekly, DaysOfWeek: []int{tue, 4}, Interval: 1},
		},
		{
			name: "毎日を 7 つの曜日の毎週にする", lines: []string{"RRULE:FREQ=DAILY;INTERVAL=1;COUNT=3"}, first: "2026-10-20",
			want: schedule.Rule{Frequency: schedule.Weekly, DaysOfWeek: []int{1, 2, 3, 4, 5, 6, 7}, Interval: 1}, end: "2026-10-22",
		},
		{
			name: "WKST=SU の隔週の日曜を含む複数の曜日", lines: []string{"RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=SU,TU;WKST=SU"}, first: "2026-10-20",
			want: schedule.Rule{Frequency: schedule.Weekly, DaysOfWeek: []int{tue, 7}, Interval: 2},
		},
		{
			name: "WKST の無い隔週の日曜を含まない複数の曜日の COUNT", lines: []string{"RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,TH;COUNT=3"}, first: "2026-10-20",
			want: schedule.Rule{Frequency: schedule.Weekly, DaysOfWeek: []int{tue, 4}, Interval: 2}, end: "2026-11-03",
		},
		{
			name: "WKST=MO の隔週の日曜を含まない複数の曜日", lines: []string{"RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,SA;WKST=MO"}, first: "2026-10-20",
			want: schedule.Rule{Frequency: schedule.Weekly, DaysOfWeek: []int{tue, 6}, Interval: 2},
		},
		{
			name: "WKST=SA の隔週の 1 つの曜日", lines: []string{"RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=TU;WKST=SA"}, first: "2026-10-20",
			want: schedule.Rule{Frequency: schedule.Weekly, DaysOfWeek: []int{tue}, Interval: 2},
		},
		{
			name: "毎月の日", lines: []string{"RRULE:FREQ=MONTHLY;BYMONTHDAY=20"}, first: "2026-10-20",
			want: schedule.Rule{Frequency: schedule.Monthly, DayOfMonth: ptr(20)},
		},
		{
			name: "BY の無い毎月", lines: []string{"RRULE:FREQ=MONTHLY"}, first: "2026-10-20",
			want: schedule.Rule{Frequency: schedule.Monthly},
		},
		{
			name: "毎月の第 3 火曜", lines: []string{"RRULE:FREQ=MONTHLY;BYDAY=3TU"}, first: "2026-10-20",
			want: schedule.Rule{Frequency: schedule.Monthly, WeekOfMonth: ptr(3), DayOfWeek: ptr(tue)},
		},
		{
			name: "毎月の第 5 火曜の COUNT は 5 週目の無い月を飛ばす", lines: []string{"RRULE:FREQ=MONTHLY;BYDAY=5TU;COUNT=3"},
			first: "2026-09-29",
			want:  schedule.Rule{Frequency: schedule.Monthly, WeekOfMonth: ptr(5), DayOfWeek: ptr(tue)}, end: "2027-03-30",
		},
		{
			name: "毎月の 31 日の COUNT は 31 日の無い月を飛ばす", lines: []string{"RRULE:FREQ=MONTHLY;BYMONTHDAY=31;COUNT=3"},
			first: "2026-10-31",
			want:  schedule.Rule{Frequency: schedule.Monthly, DayOfMonth: ptr(31)}, end: "2027-01-31",
		},
		{
			name: "毎週の COUNT", lines: []string{"RRULE:FREQ=WEEKLY;BYDAY=TU;COUNT=3"}, first: "2026-10-20",
			want: schedule.Rule{Frequency: schedule.Weekly, DaysOfWeek: []int{tue}, Interval: 1}, end: "2026-11-03",
		},
		{
			name: "COUNT=1 は最初の日に終わる", lines: []string{"RRULE:FREQ=MONTHLY;BYDAY=3TU;COUNT=1"}, first: "2026-10-20",
			want: schedule.Rule{Frequency: schedule.Monthly, WeekOfMonth: ptr(3), DayOfWeek: ptr(tue)}, end: "2026-10-20",
		},
		{
			name: "UTC の UNTIL を Asia/Tokyo の日付にする", lines: []string{"RRULE:FREQ=WEEKLY;BYDAY=TU;UNTIL=20261231T145959Z"},
			first: "2026-10-20", start: clock(10, 0),
			want: schedule.Rule{Frequency: schedule.Weekly, DaysOfWeek: []int{tue}, Interval: 1}, end: "2026-12-31",
		},
		{
			name: "UTC の UNTIL が Asia/Tokyo の翌日の 0 時なら前の日に終わる", lines: []string{"RRULE:FREQ=WEEKLY;BYDAY=TU;UNTIL=20261231T150000Z"},
			first: "2026-10-20", start: clock(10, 0),
			want: schedule.Rule{Frequency: schedule.Weekly, DaysOfWeek: []int{tue}, Interval: 1}, end: "2026-12-31",
		},
		{
			name: "UNTIL が回の開始の時刻と同じならその日を含む", lines: []string{"RRULE:FREQ=WEEKLY;BYDAY=TU;UNTIL=20261229T010000Z"},
			first: "2026-10-20", start: clock(10, 0),
			want: schedule.Rule{Frequency: schedule.Weekly, DaysOfWeek: []int{tue}, Interval: 1}, end: "2026-12-29",
		},
		{
			name: "UNTIL が回の開始の時刻より前ならその日を含まない", lines: []string{"RRULE:FREQ=WEEKLY;BYDAY=TU;UNTIL=20261229T010000Z"},
			first: "2026-10-20", start: clock(10, 30),
			want: schedule.Rule{Frequency: schedule.Weekly, DaysOfWeek: []int{tue}, Interval: 1}, end: "2026-12-28",
		},
		{
			name: "日付の UNTIL", lines: []string{"RRULE:FREQ=WEEKLY;BYDAY=TU;UNTIL=20261229"}, first: "2026-10-20", start: clock(10, 0),
			want: schedule.Rule{Frequency: schedule.Weekly, DaysOfWeek: []int{tue}, Interval: 1}, end: "2026-12-29",
		},
		{
			name: "タイムゾーンの無い UNTIL は Asia/Tokyo で読む", lines: []string{"RRULE:FREQ=WEEKLY;BYDAY=TU;UNTIL=20261229T235959"},
			first: "2026-10-20", start: clock(10, 0),
			want: schedule.Rule{Frequency: schedule.Weekly, DaysOfWeek: []int{tue}, Interval: 1}, end: "2026-12-29",
		},
		{
			name: "EXDATE を Asia/Tokyo の日付にし、並べて重ねない",
			lines: []string{
				"EXDATE;TZID=Asia/Tokyo:20261110T100000,20261027T100000",
				"RRULE:FREQ=WEEKLY;BYDAY=TU",
				"EXDATE:20261026T150000Z",
				"EXDATE;VALUE=DATE:20261117",
				"EXDATE;TZID=America/New_York:20261123T200000",
			},
			first: "2026-10-20", start: clock(10, 0),
			want:    schedule.Rule{Frequency: schedule.Weekly, DaysOfWeek: []int{tue}, Interval: 1},
			exdates: []string{"2026-10-27", "2026-11-10", "2026-11-17", "2026-11-24"},
		},
		{
			name: "タイムゾーンが空でオフセットが +09:00 の予定", lines: []string{"RRULE:FREQ=WEEKLY;BYDAY=TU"}, first: "2026-10-20",
			when: &calendar.When{DateTime: "2026-10-20T10:00:00+09:00"},
			want: schedule.Rule{Frequency: schedule.Weekly, DaysOfWeek: []int{tue}, Interval: 1},
		},
		{
			name: "Asia/Tokyo 以外のタイムゾーンの予定", lines: []string{"RRULE:FREQ=WEEKLY;BYDAY=TU"}, first: "2026-10-20",
			when: &calendar.When{DateTime: "2026-10-20T10:00:00+09:00", TimeZone: "America/New_York"}, expand: true,
		},
		{
			name: "タイムゾーンが空でオフセットが +09:00 でない予定", lines: []string{"RRULE:FREQ=WEEKLY;BYDAY=TU"}, first: "2026-10-20",
			when: &calendar.When{DateTime: "2026-10-20T01:00:00Z"}, expand: true,
		},
		{
			name: "終日の予定", lines: []string{"RRULE:FREQ=WEEKLY;BYDAY=TU"}, first: "2026-10-20",
			when: &calendar.When{Date: "2026-10-20"}, expand: true,
		},
		{
			name: "TZID の名前の小文字と値の引用符", lines: []string{"RRULE:FREQ=WEEKLY;BYDAY=TU", `EXDATE;tzid="America/New_York":20261123T200000`},
			first: "2026-10-20", start: clock(10, 0),
			want:    schedule.Rule{Frequency: schedule.Weekly, DaysOfWeek: []int{tue}, Interval: 1},
			exdates: []string{"2026-11-24"},
		},
		{name: "RRULE の同じキーが 2 回", lines: []string{"RRULE:FREQ=WEEKLY;BYDAY=TU;BYDAY=TH"}, first: "2026-10-20", expand: true},
		{name: "毎日の間隔が 2", lines: []string{"RRULE:FREQ=DAILY;INTERVAL=2"}, first: "2026-10-20", expand: true},
		{name: "BYDAY の付く毎日", lines: []string{"RRULE:FREQ=DAILY;BYDAY=TU"}, first: "2026-10-20", expand: true},
		{name: "毎月の間隔が 2", lines: []string{"RRULE:FREQ=MONTHLY;INTERVAL=2;BYMONTHDAY=20"}, first: "2026-10-20", expand: true},
		{name: "毎週の間隔が 53", lines: []string{"RRULE:FREQ=WEEKLY;INTERVAL=53;BYDAY=TU"}, first: "2026-10-20", expand: true},
		{name: "読めない INTERVAL", lines: []string{"RRULE:FREQ=WEEKLY;INTERVAL=0;BYDAY=TU"}, first: "2026-10-20", expand: true},
		{name: "毎週の数字の付く曜日", lines: []string{"RRULE:FREQ=WEEKLY;BYDAY=1TU"}, first: "2026-10-20", expand: true},
		{name: "WKST の無い隔週の日曜を含む複数の曜日", lines: []string{"RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,SU"}, first: "2026-10-20", expand: true},
		{name: "WKST=MO の隔週の日曜を含む複数の曜日", lines: []string{"RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,SU;WKST=MO"}, first: "2026-10-20", expand: true},
		{name: "WKST=SA の隔週の複数の曜日", lines: []string{"RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,TH;WKST=SA"}, first: "2026-10-20", expand: true},
		{name: "最終週", lines: []string{"RRULE:FREQ=MONTHLY;BYDAY=-1TU"}, first: "2026-10-27", expand: true},
		{name: "毎月の週の無い曜日", lines: []string{"RRULE:FREQ=MONTHLY;BYDAY=TU"}, first: "2026-10-20", expand: true},
		{name: "毎月の複数の日", lines: []string{"RRULE:FREQ=MONTHLY;BYMONTHDAY=1,20"}, first: "2026-10-20", expand: true},
		{name: "月末からの日", lines: []string{"RRULE:FREQ=MONTHLY;BYMONTHDAY=-1"}, first: "2026-10-31", expand: true},
		{name: "BYSETPOS", lines: []string{"RRULE:FREQ=MONTHLY;BYDAY=TU;BYSETPOS=3"}, first: "2026-10-20", expand: true},
		{name: "毎年", lines: []string{"RRULE:FREQ=YEARLY"}, first: "2026-10-20", expand: true},
		{name: "RDATE", lines: []string{"RRULE:FREQ=WEEKLY;BYDAY=TU", "RDATE;VALUE=DATE:20261022"}, first: "2026-10-20", expand: true},
		{name: "RRULE が無い", lines: []string{"EXDATE;VALUE=DATE:20261027"}, first: "2026-10-20", expand: true},
		{name: "RRULE が 2 つ", lines: []string{"RRULE:FREQ=WEEKLY;BYDAY=TU", "RRULE:FREQ=WEEKLY;BYDAY=TH"}, first: "2026-10-20", expand: true},
		{name: "UNTIL と COUNT の両方", lines: []string{"RRULE:FREQ=WEEKLY;BYDAY=TU;COUNT=2;UNTIL=20261231"}, first: "2026-10-20", expand: true},
		{name: "最初の日付が回に当たらない", lines: []string{"RRULE:FREQ=WEEKLY;BYDAY=WE"}, first: "2026-10-20", expand: true},
		{
			name: "UNTIL までに回が無い", lines: []string{"RRULE:FREQ=WEEKLY;BYDAY=TU;UNTIL=20261020T000000Z"},
			first: "2026-10-20", start: clock(10, 0), expand: true,
		},
		{name: "読めない EXDATE", lines: []string{"RRULE:FREQ=WEEKLY;BYDAY=TU", "EXDATE:2026-10-27"}, first: "2026-10-20", expand: true},
		{name: "読めない COUNT", lines: []string{"RRULE:FREQ=WEEKLY;BYDAY=TU;COUNT=0"}, first: "2026-10-20", expand: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			start := calendar.When{DateTime: tt.first + "T" + tt.start.String() + ":00+09:00", TimeZone: calendar.TimeZone}
			if tt.when != nil {
				start = *tt.when
			}
			got, err := calendar.RuleFromRecurrence(calendar.Event{Start: start, Recurrence: tt.lines})
			if tt.expand {
				if !errors.Is(err, calendar.ErrNeedsExpansion) {
					t.Fatalf("err = %v, want ErrNeedsExpansion", err)
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			want := calendar.Recurrence{Rule: tt.want}
			if tt.end != "" {
				want.Rule.EndDate = ptr(date(t, tt.end))
			}
			for _, d := range tt.exdates {
				want.ExclusionDates = append(want.ExclusionDates, date(t, d))
			}
			if !reflect.DeepEqual(got, want) {
				t.Errorf("RuleFromRecurrence =\n%s\nwant\n%s", format(got), format(want))
			}
		})
	}
}

func format(r calendar.Recurrence) string {
	s := fmt.Sprintf("%s days=%v interval=%d dow=%v dom=%v week=%v", r.Rule.Frequency, r.Rule.DaysOfWeek, r.Rule.Interval, deref(r.Rule.DayOfWeek), deref(r.Rule.DayOfMonth), deref(r.Rule.WeekOfMonth))
	if r.Rule.EndDate != nil {
		s += " end=" + r.Rule.EndDate.String()
	}
	return fmt.Sprintf("%s ex=%v", s, r.ExclusionDates)
}

func deref(v *int) any {
	if v == nil {
		return nil
	}
	return *v
}
