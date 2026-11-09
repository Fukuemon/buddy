package normalize

import (
	"testing"

	"github.com/Fukuemon/buddy/services/receipt/internal/record"
)

func TestStaff(t *testing.T) {
	tests := []struct{ in, want string }{
		{"職員B", "職員B"},
		{"職員　B", "職員 B"},
		{"職員 B", "職員 B"},
	}
	for _, tt := range tests {
		if got := staff(tt.in); got != tt.want {
			t.Errorf("Staff(%q) = %q, want %q", tt.in, got, tt.want)
		}
	}
}

func row(line int, start, end, duration, service string) record.Fields {
	return record.Fields{
		Line:     line,
		Date:     "2024/04/01",
		Client:   "利用者A",
		Staff:    "職員B",
		Start:    start,
		End:      end,
		Duration: duration,
		Service:  service,
	}
}

func TestSchedulesAdjust(t *testing.T) {
	tests := []struct {
		service      string
		wantEnd      string
		wantDuration int
	}{
		{"訪看I2", "09:29", 29},
		{"予防訪看Ⅰ3", "09:29", 29},
		{"予訪看I4", "09:29", 29},
		{"訪看Ⅰ２・夜", "09:29", 29},
		{"予訪看I3･深", "09:29", 29},
		{"訪看I5", "09:30", 30},
		{"訪看I5･2超", "09:30", 30},
		{"医", "09:30", 30},
	}
	for _, tt := range tests {
		t.Run(tt.service, func(t *testing.T) {
			recs, errs := Schedules([]record.Fields{row(2, "09:00", "09:30", "30", tt.service)})
			if len(errs) > 0 {
				t.Fatal(errs)
			}
			r := recs[0]
			if r.End.String() != tt.wantEnd || *r.Duration != tt.wantDuration {
				t.Errorf("終了 %s 提供 %d, want %s %d", r.End, *r.Duration, tt.wantEnd, tt.wantDuration)
			}
		})
	}
}

func TestSchedulesAdjustBoundary(t *testing.T) {
	tests := []struct {
		name, start, end, duration string
		wantEnd                    string
		wantDuration               int
	}{
		{"通常は両方を引く", "09:00", "09:30", "30", "09:29", 29},
		{"提供時間 0 は引かない", "09:00", "09:30", "0", "09:29", 0},
		{"開始と終了が同じなら終了を引かない", "09:00", "09:00", "30", "09:00", 29},
		{"翌日に終わる行も引く", "22:00", "01:00", "180", "00:59", 179},
		{"翌日の 0:00 に終わる行は開始の日の 23:59 にする", "22:00", "00:00", "120", "23:59", 119},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			recs, errs := Schedules([]record.Fields{row(2, tt.start, tt.end, tt.duration, "訪看I2")})
			if len(errs) > 0 {
				t.Fatal(errs)
			}
			r := recs[0]
			if r.End.String() != tt.wantEnd || *r.Duration != tt.wantDuration {
				t.Errorf("終了 %s 提供 %d, want %s %d", r.End, *r.Duration, tt.wantEnd, tt.wantDuration)
			}
		})
	}
}

func TestVisitsDoNotAdjust(t *testing.T) {
	recs, errs := Visits([]record.Fields{row(2, "9:00", "9:30", "30", "訪看I2")})
	if len(errs) > 0 {
		t.Fatal(errs)
	}
	if recs[0].End.String() != "09:30" || *recs[0].Duration != 30 {
		t.Errorf("実績を調整した: %s %d", recs[0].End, *recs[0].Duration)
	}
}

func TestOvernightRows(t *testing.T) {
	tests := []struct {
		name        string
		convert     func([]record.Fields) ([]record.Record, []record.CSVError)
		wantEnd     string
		wantElapsed int
	}{
		{"実績", Visits, "01:00", 180},
		{"予定", Schedules, "00:59", 179},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			recs, errs := tt.convert([]record.Fields{row(2, "22:00", "01:00", "180", "訪看I2")})
			if len(errs) > 0 {
				t.Fatalf("終了が開始より前の行を誤りにした: %v", errs)
			}
			r := recs[0]
			if r.Key.Date.String() != "2024-04-01" || r.Start.String() != "22:00" || r.End.String() != tt.wantEnd || r.Elapsed() != tt.wantElapsed {
				t.Errorf("訪問日 %s 開始 %s 終了 %s 経過 %d, want 2024-04-01 22:00 %s %d",
					r.Key.Date, r.Start, r.End, r.Elapsed(), tt.wantEnd, tt.wantElapsed)
			}
		})
	}
}

func TestEmptyDurationIsNil(t *testing.T) {
	recs, errs := Schedules([]record.Fields{row(2, "09:00", "09:30", "", "訪看I2")})
	if len(errs) > 0 {
		t.Fatal(errs)
	}
	if recs[0].Duration != nil {
		t.Errorf("Duration = %d, want nil", *recs[0].Duration)
	}
}

func TestVisitsAdditions(t *testing.T) {
	r := row(2, "9:00", "9:30", "30", "訪看I2")
	r.Additions = []string{"通常", "", "特別管理加算", "", ""}
	recs, errs := Visits([]record.Fields{r})
	if len(errs) > 0 {
		t.Fatal(errs)
	}
	if got := recs[0].AdditionText(); got != "通常, 特別管理加算" {
		t.Errorf("AdditionText = %q", got)
	}
}

func TestRowErrors(t *testing.T) {
	tests := []struct {
		name       string
		row        record.Fields
		wantColumn string
		wantReason record.Reason
	}{
		{"時刻の形", row(4, "9時", "10:00", "30", "訪看I2"), record.ColumnStart, record.ReasonInvalidTime},
		{"提供時間が整数でない", row(5, "09:00", "09:30", "三十", "訪看I2"), record.ColumnDuration, record.ReasonInvalidDuration},
		{"サービス内容が空", row(6, "09:00", "09:30", "30", ""), record.ColumnService, record.ReasonEmptyValue},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			recs, errs := Visits([]record.Fields{tt.row})
			if len(recs) != 0 || len(errs) != 1 {
				t.Fatalf("recs %d errs %v", len(recs), errs)
			}
			if errs[0].Column != tt.wantColumn || errs[0].Line != tt.row.Line || errs[0].Reason != tt.wantReason {
				t.Errorf("got %+v, want column %s line %d reason %s", errs[0], tt.wantColumn, tt.row.Line, tt.wantReason)
			}
		})
	}
}
