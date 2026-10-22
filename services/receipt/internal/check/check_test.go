package check

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"testing"

	"github.com/Fukuemon/buddy/apps/receipt-api/internal/judge"
	"github.com/Fukuemon/buddy/apps/receipt-api/internal/record"
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

func TestRunInputErrors(t *testing.T) {
	visits := []byte("訪問日,利用者名,開始時間,終了時間,提供時間,サービス内容,主訪問者,加算①,加算②,加算③,加算④,加算⑤\n" +
		"2024/04/01,利用者A,10:00,9:00,30,訪看I２,職員B,通常,,,,\n")
	schedules := []byte("訪問日,利用者名,開始時間,終了時間,提供時間,サービス内容,主訪問者\n" +
		"2024/04/01,利用者A,09:00,09:30,30,訪看I2,職員B\n" +
		"2024/99/01,利用者A,09:00,09:30,30,訪看I2,職員B\n")
	_, err := Run(context.Background(), visits, CSVSchedules{Data: schedules})
	var ie *record.InputError
	if !errors.As(err, &ie) {
		t.Fatalf("err = %v", err)
	}
	want := []record.RowError{
		{Source: record.SourceVisit, Line: 2, Column: "終了時間"},
		{Source: record.SourceSchedule, Line: 3, Column: "訪問日"},
	}
	if len(ie.Rows) != len(want) {
		t.Fatalf("rows = %+v", ie.Rows)
	}
	for i, w := range want {
		g := ie.Rows[i]
		if g.Source != w.Source || g.Line != w.Line || g.Column != w.Column {
			t.Errorf("rows[%d] = %+v, want %+v", i, g, w)
		}
	}
}
