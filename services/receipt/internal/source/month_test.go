package source

import "testing"

func TestParseMonth(t *testing.T) {
	if m, err := ParseMonth("2024-04"); err != nil || m.String() != "2024-04" {
		t.Errorf("= %v, %v", m, err)
	}
	for _, bad := range []string{"", "2024-4", "2024/04", "2024-13", "2024-04-01", "202404"} {
		if _, err := ParseMonth(bad); err == nil {
			t.Errorf("%q でエラーにならない", bad)
		}
	}
}
