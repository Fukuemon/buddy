package scheduleview_test

import (
	"context"
	"errors"
	"slices"
	"testing"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/scheduleview"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/staff"
)

// TestSchedulesReadAuthorization は、7 つの権限ごとに、ほかの職員の予定の閲覧の許可と拒否を確認する。
// 見てよくない予定は一覧から除き、1 件を指す操作は apperr.ErrForbidden を返す。自分の予定は、権限によらず見てよい。
func TestSchedulesReadAuthorization(t *testing.T) {
	tests := []struct {
		name      string
		grants    []staff.PolicyGrant
		readOther bool
	}{
		{"権限なし", nil, false},
		{"自分の予定の編集", []staff.PolicyGrant{{PolicyCode: organization.ScheduleSelfEdit}}, false},
		{"指定した職員の閲覧", []staff.PolicyGrant{{PolicyCode: organization.ScheduleUserRead, TargetUserIDs: []string{staffID}}}, true},
		{"指定した職員の編集", []staff.PolicyGrant{{PolicyCode: organization.ScheduleUserEdit, TargetUserIDs: []string{staffID}}}, true},
		{"指定したチームの閲覧", []staff.PolicyGrant{{PolicyCode: organization.ScheduleTeamRead, TargetTeamIDs: []string{targetTeam}}}, true},
		{"指定したチームの編集", []staff.PolicyGrant{{PolicyCode: organization.ScheduleTeamEdit, TargetTeamIDs: []string{targetTeam}}}, true},
		{"全ての閲覧", []staff.PolicyGrant{{PolicyCode: organization.ScheduleAllRead}}, true},
		{"全ての編集", []staff.PolicyGrant{{PolicyCode: organization.ScheduleAllEdit}}, true},
		{"所属のチームだけの編集", []staff.PolicyGrant{{PolicyCode: organization.ScheduleTeamEdit, TargetTeamIDs: []string{viewerTeam}}}, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctx := viewerCtx(tt.grants...)
			uc := newSchedules(authzStore())
			_, err := uc.Get(ctx, targetScheduleID)
			checkAllowed(t, "Get", err, tt.readOther)
			_, err = uc.GetRecurring(ctx, targetRecurringID)
			checkAllowed(t, "GetRecurring", err, tt.readOther)
			if _, err := uc.Get(ctx, ownScheduleID); err != nil {
				t.Errorf("自分の予定の Get: err = %v, want 権限によらず許可", err)
			}

			list, err := uc.List(ctx, facilityID, scheduleview.ListQuery{})
			if err != nil {
				t.Fatal(err)
			}
			if got := containsSchedule(list.Schedules, targetScheduleID); got != tt.readOther {
				t.Errorf("一覧にほかの職員の予定がある = %v, want %v", got, tt.readOther)
			}
			if !containsSchedule(list.Schedules, ownScheduleID) {
				t.Error("一覧に自分の予定がない")
			}
			if got := slices.ContainsFunc(list.RecurringSchedules, func(d scheduleview.RecurringDetail) bool { return d.ID == targetRecurringID }); got != tt.readOther {
				t.Errorf("一覧にほかの職員の繰り返しの予定がある = %v, want %v", got, tt.readOther)
			}
		})
	}
}

// TestSchedulesReadOtherFacilityStaff は、一覧が、見てよい職員を一覧の事業所の職員から選び、権限がほかの事業所の職員を指していても、その職員の予定を返さないことを確認する。
func TestSchedulesReadOtherFacilityStaff(t *testing.T) {
	s := authzStore()
	const otherScheduleID = "OTHER-STAFF-SCHEDULE"
	d := s.Schedules[targetScheduleID]
	d.ID, d.StaffID = otherScheduleID, otherStaffID
	s.Schedules[otherScheduleID] = d
	uc := newSchedules(s)
	ctx := viewerCtx(staff.PolicyGrant{PolicyCode: organization.ScheduleUserRead, TargetUserIDs: []string{staffID, otherStaffID}})
	list, err := uc.List(ctx, facilityID, scheduleview.ListQuery{})
	if err != nil {
		t.Fatal(err)
	}
	if !containsSchedule(list.Schedules, targetScheduleID) || containsSchedule(list.Schedules, otherScheduleID) {
		t.Errorf("一覧 = %v, want %s を含み %s を含まない", scheduleIDs(list.Schedules), targetScheduleID, otherScheduleID)
	}
}

// TestSchedulesReadStaffNotFound は、予定の職員が見つからないとき、1 件を指す操作が apperr.ErrNotFound を返すことを確認する。
func TestSchedulesReadStaffNotFound(t *testing.T) {
	s := authzStore()
	delete(s.Staff, staffID)
	uc := newSchedules(s)
	ctx := viewerCtx(staff.PolicyGrant{PolicyCode: organization.ScheduleAllRead})
	if _, err := uc.Get(ctx, targetScheduleID); !errors.Is(err, apperr.ErrNotFound) {
		t.Errorf("Get: err = %v, want ErrNotFound", err)
	}
	if _, err := uc.GetRecurring(ctx, targetRecurringID); !errors.Is(err, apperr.ErrNotFound) {
		t.Errorf("GetRecurring: err = %v, want ErrNotFound", err)
	}
}

func TestSchedulesWithoutPrincipal(t *testing.T) {
	uc := newSchedules(authzStore())
	if _, err := uc.Get(context.Background(), ownScheduleID); !errors.Is(err, apperr.ErrForbidden) {
		t.Errorf("Get: err = %v, want ErrForbidden", err)
	}
	if _, err := uc.GetRecurring(context.Background(), targetRecurringID); !errors.Is(err, apperr.ErrForbidden) {
		t.Errorf("GetRecurring: err = %v, want ErrForbidden", err)
	}
	if _, err := uc.List(context.Background(), facilityID, scheduleview.ListQuery{}); !errors.Is(err, apperr.ErrForbidden) {
		t.Errorf("List: err = %v, want ErrForbidden", err)
	}
}

func containsSchedule(ds []scheduleview.Detail, id string) bool {
	return slices.ContainsFunc(ds, func(d scheduleview.Detail) bool { return d.ID == id })
}
