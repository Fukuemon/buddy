package organization_test

import (
	"context"
	"errors"
	"testing"

	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/inmem"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/organization"
)

const (
	facilityID = inmem.FacilityID
)

func TestOrganizationCreatePosition(t *testing.T) {
	s := inmem.Seeded()
	s.Policies["P1"] = organization.Policy{ID: "P1"}
	uc := organization.NewService(organization.Repositories{
		Facilities: inmem.Facilities{Store: s}, Positions: inmem.Positions{Store: s}, Policies: inmem.Policies{Store: s},
	}, &inmem.Tx{}, &inmem.SeqIDs{})
	ctx := context.Background()
	if _, err := uc.CreatePosition(ctx, facilityID, "リーダー", []string{"P1", "MISSING"}); !errors.Is(err, domain.ErrInvalidInput) {
		t.Fatalf("err = %v, want ErrInvalidInput", err)
	}
	got, err := uc.CreatePosition(ctx, facilityID, "リーダー", []string{"P1"})
	if err != nil {
		t.Fatal(err)
	}
	if len(got.Policies) != 1 {
		t.Errorf("Policies = %+v", got.Policies)
	}
}
