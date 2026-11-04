package principal_test

import (
	"context"
	"errors"
	"testing"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/staff"
	"github.com/Fukuemon/buddy/services/schedule/internal/principal"
)

func subject(grants ...staff.PolicyGrant) principal.Principal {
	return principal.Principal{Staff: principal.Staff{
		ID: "SELF", TeamID: "TEAM-A",
		Policies: grants,
	}}
}

func TestRequireStaffManage(t *testing.T) {
	ctx := context.Background()
	if err := principal.RequireStaffManage(ctx); !errors.Is(err, apperr.ErrForbidden) {
		t.Errorf("職員がいない: err = %v", err)
	}
	if err := principal.RequireStaffManage(principal.With(ctx, subject(staff.PolicyGrant{PolicyCode: organization.ScheduleAllEdit}))); !errors.Is(err, apperr.ErrForbidden) {
		t.Errorf("予定の全ての編集だけ: err = %v", err)
	}
	if err := principal.RequireStaffManage(principal.With(ctx, subject(staff.PolicyGrant{PolicyCode: organization.StaffManage}))); err != nil {
		t.Errorf("職員の管理: err = %v", err)
	}
}
