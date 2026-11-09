package source

import (
	"fmt"
	"time"
)

// Month は、照合の対象の月である。
type Month struct {
	Year  int
	Month time.Month
}

// ParseMonth は、`2024-04` の形を読む。
func ParseMonth(s string) (Month, error) {
	t, err := time.Parse("2006-01", s)
	if err != nil || len(s) != len("2006-01") {
		return Month{}, fmt.Errorf("対象の月の形が違う。YYYY-MM にする: %q", s)
	}
	return Month{Year: t.Year(), Month: t.Month()}, nil
}

// String は、`2024-04` の形で返す。
func (m Month) String() string {
	return fmt.Sprintf("%04d-%02d", m.Year, int(m.Month))
}
