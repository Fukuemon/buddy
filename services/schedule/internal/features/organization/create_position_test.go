package organization_test

import (
	"context"
	"errors"
	"testing"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/inmem"
)

func TestOrganizationCreatePosition(t *testing.T) {
	s := inmem.Seeded()
	s.Policies["P1"] = organization.Policy{ID: "P1"}
	createPosition := organization.NewCreatePosition(inmem.Facilities{Store: s}, inmem.Policies{Store: s}, inmem.Positions{Store: s}, &inmem.Tx{}, &inmem.SeqIDs{}, func(context.Context) error { return nil })
	ctx := context.Background()
	if _, err := createPosition.Do(ctx, facilityID, "リーダー", []string{"P1", "MISSING"}); !errors.Is(err, apperr.ErrInvalidInput) {
		t.Fatalf("err = %v, want ErrInvalidInput", err)
	}
	got, err := createPosition.Do(ctx, facilityID, "リーダー", []string{"P1"})
	if err != nil {
		t.Fatal(err)
	}
	if len(got.Policies) != 1 {
		t.Errorf("Policies = %+v", got.Policies)
	}
	if _, err := createPosition.Do(ctx, facilityID, "リーダー", nil); !errors.Is(err, apperr.ErrConflict) ||
		err.Error() != "役職 リーダー はこの事業所にすでにあります" {
		t.Errorf("同じ名前: err = %v, want 名前の重なりの ErrConflict", err)
	}
}

// TestOrganizationCreatePositionForbidden は、職員の管理を許されない職員が役職を作れないことを確認する。
// 役職のデフォルトの権限に職員の管理の権限を入れて、ほかの職員に配れないようにするためである（ADR-0002）。
func TestOrganizationCreatePositionForbidden(t *testing.T) {
	s := inmem.Seeded()
	createPosition := organization.NewCreatePosition(inmem.Facilities{Store: s}, inmem.Policies{Store: s}, inmem.Positions{Store: s}, &inmem.Tx{}, &inmem.SeqIDs{}, func(context.Context) error { return apperr.ErrForbidden })
	if _, err := createPosition.Do(context.Background(), facilityID, "主任", nil); !errors.Is(err, apperr.ErrForbidden) {
		t.Fatalf("err = %v, want ErrForbidden", err)
	}
	if len(s.Positions) != 0 {
		t.Errorf("拒んだのに役職が増えた: %d", len(s.Positions))
	}
}
