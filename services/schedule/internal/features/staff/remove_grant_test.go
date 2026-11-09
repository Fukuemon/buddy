package staff_test

import (
	"context"
	"errors"
	"testing"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/staff"
)

func TestStaffRemoveGrant(t *testing.T) {
	ctx := context.Background()
	s := grantStore()
	d := s.Staff[staffID]
	d.Policies = []staff.PolicyGrant{{UserPolicyID: "UP1", PolicyID: "SELF"}}
	s.Staff[staffID] = d
	uc := newApp(s, allow)
	if _, err := uc.RemoveGrant(ctx, staffID, "UP1"); err != nil {
		t.Fatal(err)
	}
	if len(s.Staff[staffID].Policies) != 0 {
		t.Errorf("Policies = %+v, want なし", s.Staff[staffID].Policies)
	}
	if _, err := uc.RemoveGrant(ctx, staffID, "UP1"); !errors.Is(err, apperr.ErrNotFound) {
		t.Errorf("外した権限をもう一度: err = %v, want ErrNotFound", err)
	}
}
