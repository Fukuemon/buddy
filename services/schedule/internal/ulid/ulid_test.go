package ulid_test

import (
	"testing"

	"github.com/Fukuemon/buddy/services/schedule/internal/ulid"
)

func TestIsValid(t *testing.T) {
	tests := []struct {
		id   string
		want bool
	}{
		{"01J6SMYDSKKKNJCR2Y3242T7YX", true},
		{"7ZZZZZZZZZZZZZZZZZZZZZZZZZ", true},
		{"8ZZZZZZZZZZZZZZZZZZZZZZZZZ", false},
		{"01J6SMYDSKKKNJCR2Y3242T7Y", false},
		{"01J6SMYDSKKKNJCR2Y3242T7YXX", false},
		{"01J6SMYDSKKKNJCR2Y3242T7YU", false},
		{"01j6smydskkknjcr2y3242t7yx", false},
		{"", false},
	}
	for _, tt := range tests {
		if got := ulid.IsValid(tt.id); got != tt.want {
			t.Errorf("Valid(%q) = %v, want %v", tt.id, got, tt.want)
		}
	}
}
