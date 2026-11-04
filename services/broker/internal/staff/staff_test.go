package staff

import (
	"errors"
	"slices"
	"testing"
)

// TestTransitions は、遷移ごとに、遷移元の状態と、遷移元でない状態を拒むエラーを確認する。
func TestTransitions(t *testing.T) {
	statuses := []string{StatusPending, StatusActive, StatusSuspended, StatusRetired}
	tests := []struct {
		name   string
		tr     Transition
		to     string
		refuse map[string]error
	}{
		{
			name:   "Activation",
			tr:     Activation(),
			to:     StatusActive,
			refuse: map[string]error{StatusSuspended: ErrSuspended, StatusRetired: ErrRetired},
		},
		{
			name:   "Resumption",
			tr:     Resumption(),
			to:     StatusActive,
			refuse: map[string]error{StatusPending: ErrNotSuspended, StatusRetired: ErrRetired},
		},
		{
			name:   "Suspension",
			tr:     Suspension(),
			to:     StatusSuspended,
			refuse: map[string]error{StatusRetired: ErrRetired},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if tt.tr.To != tt.to {
				t.Errorf("To = %s, want %s", tt.tr.To, tt.to)
			}
			for _, s := range statuses {
				want, refused := tt.refuse[s]
				if got := slices.Contains(tt.tr.From, s); got == refused {
					t.Errorf("From が %s を含む = %v, want %v", s, got, !refused)
				}
				if !refused {
					continue
				}
				if err := tt.tr.Refuse(s); !errors.Is(err, want) {
					t.Errorf("Refuse(%s) = %v, want %v", s, err, want)
				}
			}
		})
	}
}
