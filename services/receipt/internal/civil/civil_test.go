package civil

import "testing"

func TestParseDate(t *testing.T) {
	tests := []struct {
		in      string
		want    string
		wantErr bool
	}{
		{"2024/04/01", "2024-04-01", false},
		{"2024/4/1", "2024-04-01", false},
		{"2024-04-01", "2024-04-01", false},
		{"2024/04/01 00:00:00", "2024-04-01", false},
		{" 2024/04/01 ", "2024-04-01", false},
		{"2024/02/29", "2024-02-29", false},
		{"2023/02/29", "", true},
		{"2024/13/01", "", true},
		{"24/04/01", "", true},
		{"2024/04", "", true},
		{"", "", true},
	}
	for _, tt := range tests {
		t.Run(tt.in, func(t *testing.T) {
			got, err := ParseDate(tt.in)
			if (err != nil) != tt.wantErr {
				t.Fatalf("err = %v, wantErr %v", err, tt.wantErr)
			}
			if !tt.wantErr && got.String() != tt.want {
				t.Errorf("got %s, want %s", got, tt.want)
			}
		})
	}
}

func TestDateCompare(t *testing.T) {
	a, _ := NewDate(2024, 4, 1)
	b, _ := NewDate(2024, 4, 2)
	c, _ := NewDate(2024, 5, 1)
	if a.Compare(b) >= 0 || b.Compare(c) >= 0 || c.Compare(a) <= 0 || a.Compare(a) != 0 {
		t.Error("Compare の順が違う")
	}
}

func TestParseClock(t *testing.T) {
	tests := []struct {
		in      string
		want    string
		wantErr bool
	}{
		{"8:45", "08:45", false},
		{"08:45", "08:45", false},
		{"0:00", "00:00", false},
		{"23:59", "23:59", false},
		{"24:00", "", true},
		{"9:60", "", true},
		{"9:5", "", true},
		{"0845", "", true},
		{"08:45:00", "", true},
		{"", "", true},
	}
	for _, tt := range tests {
		t.Run(tt.in, func(t *testing.T) {
			got, err := ParseClock(tt.in)
			if (err != nil) != tt.wantErr {
				t.Fatalf("err = %v, wantErr %v", err, tt.wantErr)
			}
			if !tt.wantErr && got.String() != tt.want {
				t.Errorf("got %s, want %s", got, tt.want)
			}
		})
	}
}

func TestClockAddMinutes(t *testing.T) {
	tests := []struct {
		in      string
		minutes int
		want    string
	}{
		{"09:30", -1, "09:29"},
		{"00:00", -1, "23:59"},
		{"23:30", 60, "00:30"},
		{"22:00", 1440, "22:00"},
	}
	for _, tt := range tests {
		c, _ := ParseClock(tt.in)
		if got := c.AddMinutes(tt.minutes).String(); got != tt.want {
			t.Errorf("%s.AddMinutes(%d) = %s, want %s", tt.in, tt.minutes, got, tt.want)
		}
	}
}

func TestClockMinutesUntil(t *testing.T) {
	tests := []struct {
		start, end string
		want       int
	}{
		{"09:00", "09:30", 30},
		{"09:00", "09:00", 0},
		{"22:00", "01:00", 180},
		{"22:00", "00:00", 120},
	}
	for _, tt := range tests {
		s, _ := ParseClock(tt.start)
		e, _ := ParseClock(tt.end)
		if got := s.MinutesUntil(e); got != tt.want {
			t.Errorf("%s.MinutesUntil(%s) = %d, want %d", tt.start, tt.end, got, tt.want)
		}
	}
}

func TestTextRoundTrip(t *testing.T) {
	d, _ := NewDate(2024, 4, 1)
	b, _ := d.MarshalText()
	var d2 Date
	if err := d2.UnmarshalText(b); err != nil || d2 != d {
		t.Errorf("Date: %v %v", d2, err)
	}
	c := Clock(8*60 + 45)
	b, _ = c.MarshalText()
	var c2 Clock
	if err := c2.UnmarshalText(b); err != nil || c2 != c {
		t.Errorf("Clock: %v %v", c2, err)
	}
}
