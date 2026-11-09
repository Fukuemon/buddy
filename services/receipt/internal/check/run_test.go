package check

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"testing"

	"github.com/Fukuemon/buddy/services/receipt/internal/judge"
	"github.com/Fukuemon/buddy/services/receipt/internal/record"
)

func readTestdata(t *testing.T, name string) []byte {
	t.Helper()
	b, err := os.ReadFile(filepath.Join("..", "..", "testdata", name))
	if err != nil {
		t.Fatal(err)
	}
	return b
}

func run(t *testing.T, visits, schedules []byte) Report {
	t.Helper()
	rep, err := Run(context.Background(), visits, CSVSchedules{Data: schedules})
	if err != nil {
		t.Fatal(err)
	}
	return rep
}

func TestRunTestdata(t *testing.T) {
	rep := run(t, readTestdata(t, "visits_utf8.csv"), readTestdata(t, "schedules_utf8.csv"))

	if want := (Summary{Mismatch: 3, ScheduleOnly: 1, VisitOnly: 1, Match: 3}); rep.Summary != want {
		t.Errorf("Summary = %+v, want %+v", rep.Summary, want)
	}
	type row struct {
		category      judge.Category
		client        string
		scheduleStart string
		visitStart    string
	}
	want := []row{
		{judge.Mismatch, "利用者C", "10:00", "10:05"},
		{judge.Mismatch, "利用者J", "15:00", "15:00"},
		{judge.Mismatch, "利用者K", "09:00", "09:05"},
		{judge.ScheduleOnly, "利用者F", "09:00", ""},
		{judge.VisitOnly, "利用者G", "", "09:00"},
		{judge.Match, "利用者A", "09:00", "09:00"},
		{judge.Match, "利用者D", "13:00", "13:00"},
		{judge.Match, "利用者K", "15:00", "15:00"},
	}
	if len(rep.Rows) != len(want) {
		t.Fatalf("rows = %d, want %d", len(rep.Rows), len(want))
	}
	for i, r := range rep.Rows {
		got := row{category: r.Category, client: r.Client}
		if r.Schedule != nil {
			got.scheduleStart = r.Schedule.Start.String()
		}
		if r.Visit != nil {
			got.visitStart = r.Visit.Start.String()
		}
		if got != want[i] {
			t.Errorf("rows[%d] = %+v, want %+v", i, got, want[i])
		}
	}
}

func TestRunCP932EqualsUTF8(t *testing.T) {
	utf8 := run(t, readTestdata(t, "visits_utf8.csv"), readTestdata(t, "schedules_utf8.csv"))
	bom := []byte("\xEF\xBB\xBF")
	tests := []struct {
		name              string
		visits, schedules []byte
	}{
		{"CP932", readTestdata(t, "visits_cp932.csv"), readTestdata(t, "schedules_cp932.csv")},
		{"BOM 付きの UTF-8", append(bom, readTestdata(t, "visits_utf8.csv")...), append(bom, readTestdata(t, "schedules_utf8.csv")...)},
		{"CP932 と UTF-8 の混在", readTestdata(t, "visits_cp932.csv"), readTestdata(t, "schedules_utf8.csv")},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := run(t, tt.visits, tt.schedules); !reflect.DeepEqual(got, utf8) {
				t.Errorf("UTF-8 と結果が違う\n got %+v\nwant %+v", got, utf8)
			}
		})
	}
}

func TestRunOvernight(t *testing.T) {
	visits := []byte("訪問日,利用者名,開始時間,終了時間,提供時間,サービス内容,主訪問者,加算①,加算②,加算③,加算④,加算⑤\n" +
		"2024/04/01,利用者A,23:30,0:59,89,訪看I４,職員B,深夜,,,,\n" +
		"2024/04/01,利用者B,22:30,23:59,89,訪看I４,職員B,深夜,,,,\n" +
		"2024/04/01,利用者C,22:00,1:00,180,医,職員B,深夜,,,,\n")
	schedules := []byte("訪問日,利用者名,開始時間,終了時間,提供時間,サービス内容,主訪問者\n" +
		"2024/04/01,利用者A,23:30,01:00,90,訪看I4,職員B\n" +
		"2024/04/01,利用者B,22:30,00:00,90,訪看I4,職員B\n")
	rep := run(t, visits, schedules)

	type row struct {
		category                 judge.Category
		date, client             string
		scheduleEnd, visitEnd    string
		scheduleElapsed, elapsed int
	}
	want := []row{
		{judge.VisitOnly, "2024-04-01", "利用者C", "", "01:00", 0, 0},
		{judge.Match, "2024-04-01", "利用者B", "23:59", "23:59", 89, 89},
		{judge.Match, "2024-04-01", "利用者A", "00:59", "00:59", 89, 89},
	}
	if len(rep.Rows) != len(want) {
		t.Fatalf("rows = %+v", rep.Rows)
	}
	for i, r := range rep.Rows {
		got := row{category: r.Category, date: r.Date.String(), client: r.Client}
		if r.Schedule != nil {
			got.scheduleEnd = r.Schedule.End.String()
		}
		if r.Visit != nil {
			got.visitEnd = r.Visit.End.String()
		}
		if r.Checks != nil {
			got.scheduleElapsed, got.elapsed = *r.Checks.ScheduleElapsed.Minutes, *r.Checks.VisitElapsed.Minutes
		}
		if got != want[i] {
			t.Errorf("rows[%d] = %+v, want %+v", i, got, want[i])
		}
	}
}

func TestRunInputErrors(t *testing.T) {
	visits := []byte("訪問日,利用者名,開始時間,終了時間,提供時間,サービス内容,主訪問者,加算①,加算②,加算③,加算④,加算⑤\n" +
		"2024/04/01,利用者A,10:00,25:00,30,訪看I２,職員B,通常,,,,\n")
	schedules := []byte("訪問日,利用者名,開始時間,終了時間,提供時間,サービス内容,主訪問者\n" +
		"2024/04/01,利用者A,09:00,09:30,30,訪看I2,職員B\n" +
		"2024/99/01,利用者A,09:00,09:30,30,訪看I2,職員B\n")
	_, err := Run(context.Background(), visits, CSVSchedules{Data: schedules})
	var ie *record.InputError
	if !errors.As(err, &ie) {
		t.Fatalf("err = %v", err)
	}
	want := []record.CSVError{
		{Input: record.InputVisit, Reason: record.ReasonInvalidTime, Line: 2, Column: "終了時間"},
		{Input: record.InputSchedule, Reason: record.ReasonInvalidDate, Line: 3, Column: "訪問日"},
	}
	if len(ie.Errors) != len(want) {
		t.Fatalf("rows = %+v", ie.Errors)
	}
	for i, w := range want {
		g := ie.Errors[i]
		if g.Input != w.Input || g.Reason != w.Reason || g.Line != w.Line || g.Column != w.Column {
			t.Errorf("rows[%d] = %+v, want %+v", i, g, w)
		}
	}
}
