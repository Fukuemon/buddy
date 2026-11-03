package servicerule

import (
	"fmt"
	"testing"
)

func TestLookupBoundaries(t *testing.T) {
	tests := []struct {
		service  string
		min, max int
	}{
		{"訪看I２", 20, 29},
		{"予防看I２", 20, 29},
		{"予訪看I２", 20, 29},
		{"予防訪看I２", 20, 29},
		{"訪看I３", 30, 59},
		{"予防看I３", 30, 59},
		{"予訪看I３", 30, 59},
		{"予防訪看I３", 30, 59},
		{"訪看I４", 60, 89},
		{"予防看I４", 60, 89},
		{"予訪看I４", 60, 89},
		{"予防訪看I４", 60, 89},
		{"訪看I５", 21, 40},
		{"予防看I５", 21, 40},
		{"予訪看I５", 21, 40},
		{"予防訪看I５", 21, 40},
		{"訪看I５・２超", 41, 60},
		{"訪看I５２超", 41, 60},
		{"予防看I５・２超", 41, 60},
		{"予訪看I５・２超", 41, 60},
		{"予防訪看I５・２超", 41, 60},
		{"予防訪看I５２超", 41, 60},
		{"訪看I２・夜", 20, 29},
		{"訪看I３・深", 30, 59},
		{"予訪看I５・２超・夜", 41, 60},
		{"基本療養費", 30, 90},
		{"医", 30, 90},
		{"難病等複数回訪問加算(２回)", 30, 90},
		{"基本療養費(I)", 30, 90},
		{"難病等複数回訪問加算(３回以上)", 30, 90},
	}
	for _, tt := range tests {
		r, ok := Lookup(tt.service)
		if !ok {
			t.Errorf("%s: 範囲がない", tt.service)
			continue
		}
		cases := []struct {
			minutes int
			want    bool
		}{
			{tt.min - 1, false},
			{tt.min, true},
			{tt.max, true},
			{tt.max + 1, false},
		}
		for _, c := range cases {
			t.Run(fmt.Sprintf("%s/%d", tt.service, c.minutes), func(t *testing.T) {
				if got := r.Has(c.minutes); got != c.want {
					t.Errorf("Contains(%d) = %v, want %v（範囲 %s）", c.minutes, got, c.want, r)
				}
			})
		}
	}
}

func TestLookupUnknown(t *testing.T) {
	for _, s := range []string{"", "訪看I１", "訪看I１・夜", "訪看I2", "訪看I２・早", "精神科訪看"} {
		if _, ok := Lookup(s); ok {
			t.Errorf("%q に範囲がある", s)
		}
	}
}

func TestRangeString(t *testing.T) {
	if got := (Range{20, 29}).String(); got != "20~29" {
		t.Errorf("got %q", got)
	}
}

func TestAdjustsScheduleEnd(t *testing.T) {
	adjusted := []string{
		"訪看I２", "予防看I２", "予訪看I２", "予防訪看I２",
		"訪看I３", "予防看I３", "予訪看I３", "予防訪看I３",
		"訪看I４", "予防看I４", "予訪看I４", "予防訪看I４",
		"訪看I２・夜", "予訪看I３・深",
	}
	for _, s := range adjusted {
		if !HasScheduleEndAdjustment(s) {
			t.Errorf("%s を調整しない", s)
		}
	}
	for _, s := range []string{"訪看I５", "訪看I５・２超", "医", "基本療養費", "難病等複数回訪問加算(２回)"} {
		if HasScheduleEndAdjustment(s) {
			t.Errorf("%s を調整する", s)
		}
	}
}

func TestServiceMatches(t *testing.T) {
	tests := []struct {
		schedule, visit string
		want            bool
	}{
		{"訪看I２", "訪看I２", true},
		{"訪看I２", "訪看I３", false},
		{"訪看I２", "訪看I２・夜", true},
		{"訪看I２・深", "訪看I２", true},
		{"訪看I２", "訪看I３・夜", false},
		{"医", "基本療養費(I)", true},
		{"医", "難病等複数回訪問加算(２回)", true},
		{"医", "訪看I２", false},
		{"医", "医", true},
		{"基本療養費(I)", "医", false},
	}
	for _, tt := range tests {
		if got := IsMatchingService(tt.schedule, tt.visit); got != tt.want {
			t.Errorf("ServiceMatches(%q, %q) = %v, want %v", tt.schedule, tt.visit, got, tt.want)
		}
	}
}

func TestBase(t *testing.T) {
	tests := []struct{ in, want string }{
		{"訪看I２・夜", "訪看I２"},
		{"予訪看I３・深", "予訪看I３"},
		{"訪看I５・２超・夜", "訪看I５・２超"},
		{"訪看I５・２超", "訪看I５・２超"},
		{"夜・訪看I２", "夜・訪看I２"},
	}
	for _, tt := range tests {
		if got := base(tt.in); got != tt.want {
			t.Errorf("Base(%q) = %q, want %q", tt.in, got, tt.want)
		}
	}
}
