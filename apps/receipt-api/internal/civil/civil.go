// Package civil は、時差を持たない日付と、1 日の中の時刻を表す。
package civil

import (
	"fmt"
	"strconv"
	"strings"
	"time"
)

// Date は、時刻と時差を持たない暦の日付である。ゼロ値は日付として無効である。
type Date struct {
	year  int
	month int
	day   int
}

// NewDate は、年月日から Date を作る。暦にない日付ならエラーを返す。
func NewDate(year, month, day int) (Date, error) {
	t := time.Date(year, time.Month(month), day, 0, 0, 0, 0, time.UTC)
	if t.Year() != year || int(t.Month()) != month || t.Day() != day {
		return Date{}, fmt.Errorf("暦にない日付: %04d-%02d-%02d", year, month, day)
	}
	return Date{year: year, month: month, day: day}, nil
}

// ParseDate は、`2024/4/1` と `2024-04-01` の形を読む。
// 日付の後ろに空白で区切った時刻があれば無視する。
func ParseDate(s string) (Date, error) {
	s = strings.TrimSpace(s)
	if i := strings.IndexByte(s, ' '); i >= 0 {
		s = s[:i]
	}
	parts := strings.FieldsFunc(s, func(r rune) bool { return r == '/' || r == '-' })
	if len(parts) != 3 || len(parts[0]) != 4 {
		return Date{}, fmt.Errorf("日付の形が違う: %q", s)
	}
	var n [3]int
	for i, p := range parts {
		v, err := strconv.Atoi(p)
		if err != nil || len(p) > 4 {
			return Date{}, fmt.Errorf("日付の形が違う: %q", s)
		}
		n[i] = v
	}
	return NewDate(n[0], n[1], n[2])
}

// String は、`2024-04-01` の形で返す。
func (d Date) String() string {
	return fmt.Sprintf("%04d-%02d-%02d", d.year, d.month, d.day)
}

// Compare は、d が e より前なら負、同じなら 0、後なら正を返す。
func (d Date) Compare(e Date) int {
	switch {
	case d.year != e.year:
		return d.year - e.year
	case d.month != e.month:
		return d.month - e.month
	default:
		return d.day - e.day
	}
}

// MarshalText は、String と同じ形を返す。
func (d Date) MarshalText() ([]byte, error) {
	return []byte(d.String()), nil
}

// UnmarshalText は、ParseDate で読む。
func (d *Date) UnmarshalText(b []byte) error {
	v, err := ParseDate(string(b))
	if err != nil {
		return err
	}
	*d = v
	return nil
}

// Clock は、1 日の中の時刻を 0 時からの分で表す。日付をまたぐ値は持たない。
type Clock int

// ParseClock は、`8:45` と `08:45` の形を読む。
func ParseClock(s string) (Clock, error) {
	s = strings.TrimSpace(s)
	h, m, ok := strings.Cut(s, ":")
	if !ok || len(h) < 1 || len(h) > 2 || len(m) != 2 {
		return 0, fmt.Errorf("時刻の形が違う: %q", s)
	}
	hh, err1 := strconv.Atoi(h)
	mm, err2 := strconv.Atoi(m)
	if err1 != nil || err2 != nil || hh < 0 || hh > 23 || mm < 0 || mm > 59 {
		return 0, fmt.Errorf("時刻の形が違う: %q", s)
	}
	return Clock(hh*60 + mm), nil
}

// String は、`08:45` の形で返す。
func (c Clock) String() string {
	return fmt.Sprintf("%02d:%02d", int(c)/60, int(c)%60)
}

// MarshalText は、String と同じ形を返す。
func (c Clock) MarshalText() ([]byte, error) {
	return []byte(c.String()), nil
}

// UnmarshalText は、ParseClock で読む。
func (c *Clock) UnmarshalText(b []byte) error {
	v, err := ParseClock(string(b))
	if err != nil {
		return err
	}
	*c = v
	return nil
}
