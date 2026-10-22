package civil_test

import (
	"encoding/json"
	"testing"

	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
)

func TestParseDate(t *testing.T) {
	tests := []struct {
		in      string
		want    string
		wantErr bool
	}{
		{in: "2026-10-20", want: "2026-10-20"},
		{in: "2024-02-29", want: "2024-02-29"},
		{in: "2026-02-29", wantErr: true},
		{in: "2026/10/20", wantErr: true},
		{in: "", wantErr: true},
	}
	for _, tt := range tests {
		got, err := civil.ParseDate(tt.in)
		if (err != nil) != tt.wantErr {
			t.Fatalf("ParseDate(%q) err = %v", tt.in, err)
		}
		if err == nil && got.String() != tt.want {
			t.Errorf("ParseDate(%q) = %s, want %s", tt.in, got, tt.want)
		}
	}
}

func TestParseTime(t *testing.T) {
	tests := []struct {
		in      string
		want    string
		wantErr bool
	}{
		{in: "09:30", want: "09:30"},
		{in: "17:00:59", want: "17:00"},
		{in: "24:00", wantErr: true},
		{in: "9時", wantErr: true},
	}
	for _, tt := range tests {
		got, err := civil.ParseTime(tt.in)
		if (err != nil) != tt.wantErr {
			t.Fatalf("ParseTime(%q) err = %v", tt.in, err)
		}
		if err == nil && got.String() != tt.want {
			t.Errorf("ParseTime(%q) = %s, want %s", tt.in, got, tt.want)
		}
	}
}

func TestJSON(t *testing.T) {
	type payload struct {
		Date civil.Date `json:"date"`
		Time civil.Time `json:"time"`
	}
	var p payload
	if err := json.Unmarshal([]byte(`{"date":"2026-10-20","time":"09:05"}`), &p); err != nil {
		t.Fatal(err)
	}
	b, err := json.Marshal(p)
	if err != nil {
		t.Fatal(err)
	}
	if got := string(b); got != `{"date":"2026-10-20","time":"09:05"}` {
		t.Errorf("got %s", got)
	}
}
