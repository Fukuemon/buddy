package apperr_test

import (
	"errors"
	"testing"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
)

func TestConflict(t *testing.T) {
	err := apperr.Conflict("%s の回はすでに置き換えられています", "2026-10-12")
	if !errors.Is(err, apperr.ErrConflict) || err.Error() != "2026-10-12 の回はすでに置き換えられています" {
		t.Errorf("Conflict = %v", err)
	}
}

// TestSameFacility は、参照した ID の事業所が違うときだけ、ID を含む入力のエラーを返すことを確認する。
func TestSameFacility(t *testing.T) {
	if err := apperr.SameFacility("チーム", "T1", "F1", "F1"); err != nil {
		t.Errorf("同じ事業所: err = %v, want nil", err)
	}
	err := apperr.SameFacility("チーム", "T1", "F2", "F1")
	var ve *apperr.ValidationError
	if !errors.As(err, &ve) || !errors.Is(err, apperr.ErrInvalidInput) || err.Error() != "チーム T1 はこの事業所に属していません" {
		t.Errorf("違う事業所: err = %v", err)
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
		{name: "ほかのエラー", err: apperr.ErrNotFound, wantIs: apperr.ErrNotFound, wantMsg: apperr.ErrNotFound.Error()},
		{name: "エラーなし"},
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
