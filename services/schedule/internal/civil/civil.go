// Package civil は、タイムゾーンを持たない日付と時刻を表す。
package civil

import (
	"fmt"
	"time"
	_ "time/tzdata" // 配布のイメージ（distroless）にタイムゾーンのデータが無くても Asia/Tokyo を読むため。
)

const (
	dateLayout = "2006-01-02"
	timeLayout = "15:04"
)

var tokyo = func() *time.Location {
	loc, err := time.LoadLocation("Asia/Tokyo")
	if err != nil {
		panic(err)
	}
	return loc
}()

// Date は、年月日だけの日付である。
type Date struct {
	Year  int
	Month time.Month
	Day   int
}

// ParseDate は、"2006-01-02" の形の文字列を読む。
func ParseDate(s string) (Date, error) {
	t, err := time.Parse(dateLayout, s)
	if err != nil {
		return Date{}, fmt.Errorf("日付は YYYY-MM-DD の形です: %q", s)
	}
	return DateOf(t), nil
}

// Today は、t の事業所の現地（Asia/Tokyo）での日付を返す。予定の日付は事業所の現地の日付で持つ。
func Today(t time.Time) Date {
	return DateOf(t.In(tokyo))
}

// DateOf は、t の場所での日付を返す。
func DateOf(t time.Time) Date {
	y, m, d := t.Date()
	return Date{Year: y, Month: m, Day: d}
}

// Time は、d の 0 時を UTC で返す。
func (d Date) Time() time.Time {
	return time.Date(d.Year, d.Month, d.Day, 0, 0, 0, 0, time.UTC)
}

func (d Date) String() string { return d.Time().Format(dateLayout) }

// IsZero は、d がゼロ値かを返す。
func (d Date) IsZero() bool { return d == Date{} }

// Before は、d が u より前の日かを返す。
func (d Date) Before(u Date) bool { return d.Time().Before(u.Time()) }

// After は、d が u より後の日かを返す。
func (d Date) After(u Date) bool { return d.Time().After(u.Time()) }

// Weekday は、d の曜日を返す。
func (d Date) Weekday() time.Weekday { return d.Time().Weekday() }

// MarshalText は、d を "2006-01-02" の形で書く。
func (d Date) MarshalText() ([]byte, error) { return []byte(d.String()), nil }

// UnmarshalText は、"2006-01-02" の形の日付を読む。
func (d *Date) UnmarshalText(b []byte) error {
	v, err := ParseDate(string(b))
	if err != nil {
		return err
	}
	*d = v
	return nil
}

// Time は、日付を持たない時刻である。分の精度で扱う。
type Time struct {
	Hour   int
	Minute int
}

// ParseTime は、"15:04" か "15:04:05" の形の文字列を読む。秒は捨てる。
func ParseTime(s string) (Time, error) {
	for _, layout := range []string{timeLayout, "15:04:05"} {
		if t, err := time.Parse(layout, s); err == nil {
			return Time{Hour: t.Hour(), Minute: t.Minute()}, nil
		}
	}
	return Time{}, fmt.Errorf("時刻は HH:MM の形です: %q", s)
}

func (t Time) String() string { return fmt.Sprintf("%02d:%02d", t.Hour, t.Minute) }

// Minutes は、0 時からの経過の分を返す。
func (t Time) Minutes() int { return t.Hour*60 + t.Minute }

// Before は、t が u より前の時刻かを返す。
func (t Time) Before(u Time) bool { return t.Minutes() < u.Minutes() }

// MarshalText は、t を "15:04" の形で書く。
func (t Time) MarshalText() ([]byte, error) { return []byte(t.String()), nil }

// UnmarshalText は、"15:04" の形の時刻を読む。
func (t *Time) UnmarshalText(b []byte) error {
	v, err := ParseTime(string(b))
	if err != nil {
		return err
	}
	*t = v
	return nil
}
