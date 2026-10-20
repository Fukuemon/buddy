package normalize

import (
	"testing"

	"github.com/Fukuemon/buddy/apps/receipt-api/internal/csvio"
)

func TestService(t *testing.T) {
	tests := []struct{ in, want string }{
		{"訪看I2", "訪看I２"},
		{"訪看Ⅰ2", "訪看I２"},
		{"訪看１2", "訪看I２"},
		{"訪看12", "訪看I２"},
		{"訪看I5･2超", "訪看I５・２超"},
		{"訪看I5・2超", "訪看I５・２超"},
		{"訪看　I2", "訪看 I２"},
		{"基本療養費(1)", "基本療養費(I)"},
		{"難病等複数回訪問加算(2回)", "難病等複数回訪問加算(２回)"},
		{"医", "医"},
		{"訪看I２", "訪看I２"},
	}
	for _, tt := range tests {
		if got := Service(tt.in); got != tt.want {
			t.Errorf("Service(%q) = %q, want %q", tt.in, got, tt.want)
		}
	}
}

func TestClient(t *testing.T) {
	tests := []struct{ in, want string }{
		{"利用者A", "利用者A"},
		{"利用者　A", "利用者A"},
		{"利用者 A", "利用者A"},
		{" 利用者　 A ", "利用者A"},
	}
	for _, tt := range tests {
		if got := Client(tt.in); got != tt.want {
			t.Errorf("Client(%q) = %q, want %q", tt.in, got, tt.want)
		}
	}
}

func TestStaff(t *testing.T) {
	tests := []struct{ in, want string }{
		{"職員B", "職員B"},
		{"職員　B", "職員 B"},
		{"職員 B", "職員 B"},
	}
	for _, tt := range tests {
		if got := Staff(tt.in); got != tt.want {
			t.Errorf("Staff(%q) = %q, want %q", tt.in, got, tt.want)
		}
	}
}

func row(line int, start, end, duration, service string) csvio.Row {
	return csvio.NewRow(line, map[string]string{
		csvio.ColDate:     "2024/04/01",
		csvio.ColClient:   "利用者A",
		csvio.ColStaff:    "職員B",
		csvio.ColStart:    start,
		csvio.ColEnd:      end,
		csvio.ColDuration: duration,
		csvio.ColService:  service,
	})
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
		{"訪看I5", "09:30", 30},
		{"訪看I5･2超", "09:30", 30},
		{"医", "09:30", 30},
	}
	for _, tt := range tests {
		t.Run(tt.service, func(t *testing.T) {
			recs, errs := Schedules([]csvio.Row{row(2, "09:00", "09:30", "30", tt.service)})
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
	recs, errs := Visits([]csvio.Row{row(2, "9:00", "9:30", "30", "訪看I2")})
	if len(errs) > 0 {
		t.Fatal(errs)
	}
	if recs[0].End.String() != "09:30" || *recs[0].Duration != 30 {
		t.Errorf("実績を調整した: %s %d", recs[0].End, *recs[0].Duration)
	}
}

func TestEmptyDurationIsNil(t *testing.T) {
	recs, errs := Schedules([]csvio.Row{row(2, "09:00", "09:30", "", "訪看I2")})
	if len(errs) > 0 {
		t.Fatal(errs)
	}
	if recs[0].Duration != nil {
		t.Errorf("Duration = %d, want nil", *recs[0].Duration)
	}
}

func TestVisitsAdditions(t *testing.T) {
	r := row(2, "9:00", "9:30", "30", "訪看I2")
	values := map[string]string{}
	for _, c := range csvio.VisitColumns() {
		values[c] = r.Get(c)
	}
	values["加算①"] = "通常"
	values["加算③"] = "特別管理加算"
	recs, errs := Visits([]csvio.Row{csvio.NewRow(2, values)})
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
		row        csvio.Row
		wantColumn string
	}{
		{"終了が開始より前", row(3, "10:00", "09:59", "30", "訪看I2"), csvio.ColEnd},
		{"時刻の形", row(4, "9時", "10:00", "30", "訪看I2"), csvio.ColStart},
		{"提供時間が整数でない", row(5, "09:00", "09:30", "三十", "訪看I2"), csvio.ColDuration},
		{"サービス内容が空", row(6, "09:00", "09:30", "30", ""), csvio.ColService},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			recs, errs := Visits([]csvio.Row{tt.row})
			if len(recs) != 0 || len(errs) != 1 {
				t.Fatalf("recs %d errs %v", len(recs), errs)
			}
			if errs[0].Column != tt.wantColumn || errs[0].Line != tt.row.Line {
				t.Errorf("got %+v, want column %s line %d", errs[0], tt.wantColumn, tt.row.Line)
			}
		})
	}
}
