package servicerule

import "testing"

func TestHasScheduleEndAdjustment(t *testing.T) {
	adjusted := []string{
		"訪看I２", "予防看I２", "予訪看I２", "予防訪看I２",
		"訪看I３", "予防看I３", "予訪看I３", "予防訪看I３",
		"訪看I４", "予防看I４", "予訪看I４", "予防訪看I４",
		"訪看I２・夜", "予訪看I３・深", "予防訪看I４・夜",
	}
	for _, s := range adjusted {
		if !HasScheduleEndAdjustment(s) {
			t.Errorf("%s を調整しない", s)
		}
	}
	for _, s := range []string{"訪看I５", "訪看I５・２超", "予訪看I５２超", "訪看I１", "医", "基本療養費", "難病等複数回訪問加算(２回)"} {
		if HasScheduleEndAdjustment(s) {
			t.Errorf("%s を調整する", s)
		}
	}
}

func TestIsMatchingService(t *testing.T) {
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
			t.Errorf("IsMatchingService(%q, %q) = %v, want %v", tt.schedule, tt.visit, got, tt.want)
		}
	}
}
