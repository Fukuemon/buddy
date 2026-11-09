package organization_test

import (
	"errors"
	"testing"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
)

// TestRequireSameFacility は、参照した ID の事業所が違うときだけ、ID を含む入力のエラーを返すことを確認する。
func TestRequireSameFacility(t *testing.T) {
	if err := organization.RequireSameFacility("チーム", "T1", "F1", "F1"); err != nil {
		t.Errorf("同じ事業所: err = %v, want nil", err)
	}
	err := organization.RequireSameFacility("チーム", "T1", "F2", "F1")
	var ve *apperr.ValidationError
	if !errors.As(err, &ve) || !errors.Is(err, apperr.ErrInvalidInput) || err.Error() != "チーム T1 はこの事業所に属していません" {
		t.Errorf("違う事業所: err = %v", err)
	}
}
