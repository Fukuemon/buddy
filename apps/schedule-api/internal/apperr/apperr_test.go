package apperr_test

import (
	"errors"
	"testing"

	"github.com/Fukuemon/buddy/apps/schedule-api/internal/apperr"
)

func TestConflict(t *testing.T) {
	err := apperr.Conflict("%s の回はすでに置き換えられています", "2026-10-12")
	if !errors.Is(err, apperr.ErrConflict) || err.Error() != "2026-10-12 の回はすでに置き換えられています" {
		t.Errorf("Conflict = %v", err)
	}
}

func TestAsConflict(t *testing.T) {
	tests := []struct {
		name    string
		err     error
		wantIs  error
		wantMsg string
	}{
		{name: "衝突", err: apperr.ErrConflict, wantIs: apperr.ErrConflict, wantMsg: "チーム 訪問 はこの事業所にすでにあります"},
		{name: "ほかの誤り", err: apperr.ErrNotFound, wantIs: apperr.ErrNotFound, wantMsg: apperr.ErrNotFound.Error()},
		{name: "誤りなし"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := apperr.AsConflict(tt.err, "チーム %s はこの事業所にすでにあります", "訪問")
			if tt.wantIs == nil {
				if got != nil {
					t.Errorf("got %v, want nil", got)
				}
				return
			}
			if !errors.Is(got, tt.wantIs) || got.Error() != tt.wantMsg {
				t.Errorf("got %v, want %q", got, tt.wantMsg)
			}
		})
	}
}
