package servicecode

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
				if got := r.Contains(c.minutes); got != c.want {
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

func TestBase(t *testing.T) {
	tests := []struct{ in, want string }{
		{"訪看I２・夜", "訪看I２"},
		{"予訪看I３・深", "予訪看I３"},
		{"訪看I５・２超・夜", "訪看I５・２超"},
		{"訪看I５・２超", "訪看I５・２超"},
		{"夜・訪看I２", "夜・訪看I２"},
	}
	for _, tt := range tests {
		if got := Base(tt.in); got != tt.want {
			t.Errorf("Base(%q) = %q, want %q", tt.in, got, tt.want)
		}
	}
}

func TestNormalize(t *testing.T) {
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
		if got := Normalize(tt.in); got != tt.want {
			t.Errorf("Normalize(%q) = %q, want %q", tt.in, got, tt.want)
		}
	}
}

func TestCanonical(t *testing.T) {
	tests := []struct{ in, want string }{
		{"予防訪看I２", "予防看I２"},
		{"予訪看I３", "予防看I３"},
		{"予防看I４", "予防看I４"},
		{"訪看I５２超", "訪看I５・２超"},
		{"予防訪看I５２超", "予防看I５・２超"},
		{"訪看I２", "訪看I２"},
	}
	for _, tt := range tests {
		if got := Canonical(tt.in); got != tt.want {
			t.Errorf("Canonical(%q) = %q, want %q", tt.in, got, tt.want)
		}
	}
}

func TestTimeClass(t *testing.T) {
	tests := []struct {
		in, want string
		ok       bool
	}{
		{"訪看I２", "I２", true},
		{"予訪看I３・夜", "I３", true},
		{"予防訪看I５２超", "I５・２超", true},
		{"訪看I１", "", false},
		{"医", "", false},
		{"基本療養費(I)", "", false},
	}
	for _, tt := range tests {
		if got, ok := TimeClass(tt.in); got != tt.want || ok != tt.ok {
			t.Errorf("TimeClass(%q) = %q, %v, want %q, %v", tt.in, got, ok, tt.want, tt.ok)
		}
	}
}
