package schedule_test

import (
	"errors"
	"testing"
	"time"

	"github.com/Fukuemon/buddy/apps/schedule-api/internal/apperr"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/civil"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/schedule"
)

var (
	normalType = schedule.Type{ID: "01JG8Z3XZVD7M11CGETHQNAA6X", Name: schedule.Normal}
	visitType  = schedule.Type{ID: "01JG8Z3XZVD7M11CGETHQNAA6W", Name: schedule.Visit}
)

func ptr[T any](v T) *T { return &v }

func date(t *testing.T, s string) civil.Date {
	t.Helper()
	d, err := civil.ParseDate(s)
	if err != nil {
		t.Fatal(err)
	}
	return d
}

func clock(h, m int) civil.Time { return civil.Time{Hour: h, Minute: m} }

func TestNew(t *testing.T) {
	base := func(t *testing.T) schedule.Slot {
		return schedule.Slot{
			FacilityID: "F", StaffID: "S",
			Date:      date(t, "2026-10-20"),
			StartTime: clock(9, 0), EndTime: clock(10, 0),
		}
	}
	tests := []struct {
		name         string
		typ          schedule.Type
		edit         func(*schedule.Slot)
		wantErr      bool
		wantOvertime bool
	}{
		{name: "通常の予定", typ: normalType, edit: func(s *schedule.Slot) { s.Title = ptr("会議") }},
		{name: "通常の予定でタイトルがない", typ: normalType, edit: func(*schedule.Slot) {}, wantErr: true},
		{name: "通常の予定に訪問の情報", typ: normalType, edit: func(s *schedule.Slot) {
			s.Title = ptr("会議")
			s.VisitInfoID = ptr("V")
		}, wantErr: true},
		{name: "訪問の予定", typ: visitType, edit: func(s *schedule.Slot) { s.VisitInfoID = ptr("V") }},
		{name: "訪問の予定で訪問の情報がない", typ: visitType, edit: func(*schedule.Slot) {}, wantErr: true},
		{name: "終了が開始と同じ", typ: normalType, edit: func(s *schedule.Slot) {
			s.Title = ptr("会議")
			s.EndTime = s.StartTime
		}, wantErr: true},
		{name: "終了が開始より前", typ: normalType, edit: func(s *schedule.Slot) {
			s.Title = ptr("会議")
			s.EndTime = clock(8, 59)
		}, wantErr: true},
		{name: "空のタイトル", typ: normalType, edit: func(s *schedule.Slot) { s.Title = ptr(" ") }, wantErr: true},
		{name: "日付がない", typ: normalType, edit: func(s *schedule.Slot) {
			s.Title = ptr("会議")
			s.Date = civil.Date{}
		}, wantErr: true},
		{name: "17 時に始まる予定は時間外", typ: normalType, edit: func(s *schedule.Slot) {
			s.Title = ptr("会議")
			s.StartTime, s.EndTime = clock(17, 0), clock(18, 0)
		}, wantOvertime: true},
		{name: "16 時 59 分に始まる予定は時間内", typ: normalType, edit: func(s *schedule.Slot) {
			s.Title = ptr("会議")
			s.StartTime, s.EndTime = clock(16, 59), clock(18, 0)
		}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := base(t)
			tt.edit(&s)
			got, err := schedule.New("ID", s, tt.typ)
			if tt.wantErr {
				if !errors.Is(err, apperr.ErrInvalidInput) {
					t.Fatalf("err = %v, want ErrInvalidInput", err)
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			if got.TypeID != tt.typ.ID {
				t.Errorf("TypeID = %s", got.TypeID)
			}
			if got.IsOverTimeWork != tt.wantOvertime {
				t.Errorf("IsOverTimeWork = %v, want %v", got.IsOverTimeWork, tt.wantOvertime)
			}
		})
	}
}

func TestNewRule(t *testing.T) {
	tests := []struct {
		name    string
		rule    schedule.Rule
		wantErr bool
	}{
		{name: "毎週で曜日なし", rule: schedule.Rule{Frequency: schedule.Weekly}},
		{name: "毎週で曜日", rule: schedule.Rule{Frequency: schedule.Weekly, DayOfWeek: ptr(3)}},
		{name: "毎週で日", rule: schedule.Rule{Frequency: schedule.Weekly, DayOfMonth: ptr(3)}, wantErr: true},
		{name: "毎月で日", rule: schedule.Rule{Frequency: schedule.Monthly, DayOfMonth: ptr(31)}},
		{name: "毎月で週と曜日", rule: schedule.Rule{Frequency: schedule.Monthly, WeekOfMonth: ptr(2), DayOfWeek: ptr(1)}},
		{name: "毎月で週だけ", rule: schedule.Rule{Frequency: schedule.Monthly, WeekOfMonth: ptr(2)}, wantErr: true},
		{name: "毎月で曜日だけ", rule: schedule.Rule{Frequency: schedule.Monthly, DayOfWeek: ptr(2)}, wantErr: true},
		{name: "毎月で日と曜日", rule: schedule.Rule{Frequency: schedule.Monthly, DayOfMonth: ptr(1), DayOfWeek: ptr(2)}, wantErr: true},
		{name: "曜日が 0", rule: schedule.Rule{Frequency: schedule.Weekly, DayOfWeek: ptr(0)}, wantErr: true},
		{name: "曜日が 8", rule: schedule.Rule{Frequency: schedule.Weekly, DayOfWeek: ptr(8)}, wantErr: true},
		{name: "日が 32", rule: schedule.Rule{Frequency: schedule.Monthly, DayOfMonth: ptr(32)}, wantErr: true},
		{name: "週が 6", rule: schedule.Rule{Frequency: schedule.Monthly, WeekOfMonth: ptr(6), DayOfWeek: ptr(1)}, wantErr: true},
		{name: "頻度が不明", rule: schedule.Rule{Frequency: "daily"}, wantErr: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := schedule.NewRule(tt.rule)
			if tt.wantErr != (err != nil) {
				t.Fatalf("err = %v, wantErr %v", err, tt.wantErr)
			}
			if err != nil && !errors.Is(err, apperr.ErrInvalidInput) {
				t.Errorf("err = %v, want ErrInvalidInput", err)
			}
		})
	}
}

func TestRecurringOccurs(t *testing.T) {
	start := "2026-10-05"
	if w := date(t, start).Weekday(); w != time.Monday {
		t.Fatalf("%s は %s", start, w)
	}
	// start が空の行は、月曜の start から始める。規則は最初の日付を回に含むものにする。
	tests := []struct {
		name  string
		start string
		rule  schedule.Rule
		day   string
		want  bool
	}{
		{name: "毎週の既定は最初の日の曜日", rule: schedule.Rule{Frequency: schedule.Weekly}, day: "2026-10-12", want: true},
		{name: "毎週の既定で別の曜日", rule: schedule.Rule{Frequency: schedule.Weekly}, day: "2026-10-13", want: false},
		{name: "毎週の水曜", start: "2026-10-07", rule: schedule.Rule{Frequency: schedule.Weekly, DayOfWeek: ptr(3)}, day: "2026-10-14", want: true},
		{name: "毎週の日曜は 7", start: "2026-10-11", rule: schedule.Rule{Frequency: schedule.Weekly, DayOfWeek: ptr(7)}, day: "2026-10-18", want: true},
		{name: "最初の日より前", rule: schedule.Rule{Frequency: schedule.Weekly}, day: "2026-09-28", want: false},
		{name: "終了日の当日", rule: schedule.Rule{Frequency: schedule.Weekly, EndDate: ptr(civil.Date{Year: 2026, Month: 10, Day: 19})}, day: "2026-10-19", want: true},
		{name: "終了日より後", rule: schedule.Rule{Frequency: schedule.Weekly, EndDate: ptr(civil.Date{Year: 2026, Month: 10, Day: 19})}, day: "2026-10-26", want: false},
		{name: "毎月の既定は最初の日の日", rule: schedule.Rule{Frequency: schedule.Monthly}, day: "2026-11-05", want: true},
		{name: "毎月の 31 日", start: "2026-10-31", rule: schedule.Rule{Frequency: schedule.Monthly, DayOfMonth: ptr(31)}, day: "2026-12-31", want: true},
		{name: "毎月の 31 日で 30 日までの月", start: "2026-10-31", rule: schedule.Rule{Frequency: schedule.Monthly, DayOfMonth: ptr(31)}, day: "2026-11-30", want: false},
		{name: "毎月の第 2 火曜", start: "2026-10-13", rule: schedule.Rule{Frequency: schedule.Monthly, WeekOfMonth: ptr(2), DayOfWeek: ptr(2)}, day: "2026-11-10", want: true},
		{name: "毎月の第 2 火曜で第 1 火曜", start: "2026-10-13", rule: schedule.Rule{Frequency: schedule.Monthly, WeekOfMonth: ptr(2), DayOfWeek: ptr(2)}, day: "2026-11-03", want: false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rule, err := schedule.NewRule(tt.rule)
			if err != nil {
				t.Fatal(err)
			}
			first := start
			if tt.start != "" {
				first = tt.start
			}
			rs, err := schedule.NewRecurring("ID", schedule.Slot{
				Date: date(t, first), StartTime: clock(9, 0), EndTime: clock(10, 0), Title: ptr("定例"),
			}, normalType, rule)
			if err != nil {
				t.Fatal(err)
			}
			if got := rs.Occurs(date(t, tt.day)); got != tt.want {
				t.Errorf("Occurs(%s) = %v, want %v", tt.day, got, tt.want)
			}
		})
	}
}

func TestNewRecurringEndDateBeforeStart(t *testing.T) {
	rule := schedule.Rule{Frequency: schedule.Weekly, EndDate: ptr(date(t, "2026-10-04"))}
	_, err := schedule.NewRecurring("ID", schedule.Slot{
		Date: date(t, "2026-10-05"), StartTime: clock(9, 0), EndTime: clock(10, 0), Title: ptr("定例"),
	}, normalType, rule)
	if !errors.Is(err, apperr.ErrInvalidInput) {
		t.Fatalf("err = %v, want ErrInvalidInput", err)
	}
}

func TestNewRecurringFirstDate(t *testing.T) {
	start := "2026-10-06"
	if w := date(t, start).Weekday(); w != time.Tuesday {
		t.Fatalf("%s は %s", start, w)
	}
	tests := []struct {
		name    string
		rule    schedule.Rule
		wantErr bool
	}{
		{name: "毎週の既定", rule: schedule.Rule{Frequency: schedule.Weekly}},
		{name: "毎週の火曜", rule: schedule.Rule{Frequency: schedule.Weekly, DayOfWeek: ptr(2)}},
		{name: "毎週の月曜", rule: schedule.Rule{Frequency: schedule.Weekly, DayOfWeek: ptr(1)}, wantErr: true},
		{name: "毎月の既定", rule: schedule.Rule{Frequency: schedule.Monthly}},
		{name: "毎月の 6 日", rule: schedule.Rule{Frequency: schedule.Monthly, DayOfMonth: ptr(6)}},
		{name: "毎月の 7 日", rule: schedule.Rule{Frequency: schedule.Monthly, DayOfMonth: ptr(7)}, wantErr: true},
		{name: "毎月の第 1 火曜", rule: schedule.Rule{Frequency: schedule.Monthly, WeekOfMonth: ptr(1), DayOfWeek: ptr(2)}},
		{name: "毎月の第 2 火曜", rule: schedule.Rule{Frequency: schedule.Monthly, WeekOfMonth: ptr(2), DayOfWeek: ptr(2)}, wantErr: true},
		{name: "毎月の第 1 月曜", rule: schedule.Rule{Frequency: schedule.Monthly, WeekOfMonth: ptr(1), DayOfWeek: ptr(1)}, wantErr: true},
		{name: "終了日が最初の日付", rule: schedule.Rule{Frequency: schedule.Weekly, EndDate: ptr(date(t, start))}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rule, err := schedule.NewRule(tt.rule)
			if err != nil {
				t.Fatal(err)
			}
			_, err = schedule.NewRecurring("ID", schedule.Slot{
				Date: date(t, start), StartTime: clock(9, 0), EndTime: clock(10, 0), Title: ptr("定例"),
			}, normalType, rule)
			if tt.wantErr != errors.Is(err, apperr.ErrInvalidInput) || (!tt.wantErr && err != nil) {
				t.Fatalf("err = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}

func TestNewCancel(t *testing.T) {
	if _, err := schedule.NewCancel("ID", "S", "体調不良"); err != nil {
		t.Fatal(err)
	}
	if _, err := schedule.NewCancel("ID", "S", ""); !errors.Is(err, apperr.ErrInvalidInput) {
		t.Fatalf("err = %v, want ErrInvalidInput", err)
	}
}

func TestListQueryValidate(t *testing.T) {
	from, to := date(t, "2026-10-20"), date(t, "2026-10-19")
	if err := (schedule.ListQuery{DateFrom: &from, DateTo: &to}).Validate(); !errors.Is(err, apperr.ErrInvalidInput) {
		t.Fatalf("err = %v, want ErrInvalidInput", err)
	}
	if err := (schedule.ListQuery{DateFrom: &to, DateTo: &from}).Validate(); err != nil {
		t.Fatal(err)
	}
}
