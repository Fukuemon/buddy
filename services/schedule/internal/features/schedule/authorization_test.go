package schedule_test

import (
	"context"
	"errors"
	"testing"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/schedule"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/staff"
	"github.com/Fukuemon/buddy/services/schedule/internal/inmem"
	"github.com/Fukuemon/buddy/services/schedule/internal/principal"
)

const (
	viewerID          = "VIEWER"
	viewerTeam        = "TEAM-A"
	targetTeam        = "TEAM-B"
	targetScheduleID  = "TARGET-SCHEDULE"
	ownScheduleID     = "OWN-SCHEDULE"
	targetRecurringID = "TARGET-RECURRING"
)

// authzStore は、閲覧する職員 viewerID（チーム A）と、予定の職員 staffID（チーム B）の予定を持つ Store を返す。
func authzStore() *inmem.Store {
	s := inmem.Seeded()
	s.Staff[viewerID] = staff.Detail{Summary: staff.Summary{Staff: staff.Staff{ID: viewerID, FacilityID: facilityID, TeamID: viewerTeam}}}
	target := s.Staff[staffID]
	target.TeamID = targetTeam
	s.Staff[staffID] = target
	slot := func(staffID string) schedule.Slot {
		return schedule.Slot{FacilityID: facilityID, StaffID: staffID, TypeID: normalTypeID, Date: civil.Date{Year: 2026, Month: 10, Day: 20},
			StartTime: civil.Time{Hour: 9}, EndTime: civil.Time{Hour: 10}}
	}
	s.Schedules[targetScheduleID] = schedule.Detail{Schedule: schedule.Schedule{ID: targetScheduleID, Slot: slot(staffID)}, TypeName: schedule.Normal}
	s.Schedules[ownScheduleID] = schedule.Detail{Schedule: schedule.Schedule{ID: ownScheduleID, Slot: slot(viewerID)}, TypeName: schedule.Normal}
	s.Recurring[targetRecurringID] = schedule.RecurringDetail{RecurringSchedule: schedule.RecurringSchedule{
		ID: targetRecurringID, Slot: slot(staffID), Rule: schedule.Rule{Frequency: schedule.Weekly},
	}}
	return s
}

func viewerCtx(grants ...staff.PolicyGrant) context.Context {
	return principal.With(context.Background(), principal.Principal{Staff: staff.Detail{
		Summary:  staff.Summary{Staff: staff.Staff{ID: viewerID, FacilityID: facilityID, TeamID: viewerTeam}},
		Policies: grants,
	}})
}

// checkAllowed は、want なら err が無いことを、want でなければ err が apperr.ErrForbidden であることを確認する。
func checkAllowed(t *testing.T, op string, err error, want bool) {
	t.Helper()
	if want && err != nil {
		t.Errorf("%s: err = %v, want 許可", op, err)
	}
	if !want && !errors.Is(err, apperr.ErrForbidden) {
		t.Errorf("%s: err = %v, want ErrForbidden", op, err)
	}
}

// TestSchedulesAuthorization は、7 つの権限ごとに、ほかの職員の予定の編集と、自分の予定の編集の許可と拒否を確認する。
// 閲覧の許可と拒否は、scheduleview の TestSchedulesReadAuthorization が確認する。
func TestSchedulesAuthorization(t *testing.T) {
	tests := []struct {
		name      string
		grants    []staff.PolicyGrant
		editOther bool
		editSelf  bool
	}{
		{"権限なし", nil, false, false},
		{"自分の予定の編集", []staff.PolicyGrant{{PolicyCode: organization.ScheduleSelfEdit}}, false, true},
		{"指定した職員の閲覧", []staff.PolicyGrant{{PolicyCode: organization.ScheduleUserRead, TargetUserIDs: []string{staffID}}}, false, false},
		{"指定した職員の編集", []staff.PolicyGrant{{PolicyCode: organization.ScheduleUserEdit, TargetUserIDs: []string{staffID}}}, true, false},
		{"指定したチームの閲覧", []staff.PolicyGrant{{PolicyCode: organization.ScheduleTeamRead, TargetTeamIDs: []string{targetTeam}}}, false, false},
		{"指定したチームの編集", []staff.PolicyGrant{{PolicyCode: organization.ScheduleTeamEdit, TargetTeamIDs: []string{targetTeam}}}, true, false},
		{"全ての閲覧", []staff.PolicyGrant{{PolicyCode: organization.ScheduleAllRead}}, false, false},
		{"全ての編集", []staff.PolicyGrant{{PolicyCode: organization.ScheduleAllEdit}}, true, true},
		{"所属のチームだけの編集", []staff.PolicyGrant{{PolicyCode: organization.ScheduleTeamEdit, TargetTeamIDs: []string{viewerTeam}}}, false, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctx := viewerCtx(tt.grants...)
			uc, _ := newSchedules(authzStore())
			other := normalSlot()
			own := normalSlot()
			own.StaffID = viewerID
			_, err := uc.Create(ctx, facilityID, other)
			checkAllowed(t, "ほかの職員の予定の Create", err, tt.editOther)
			_, err = uc.CreateRecurring(ctx, facilityID, other, schedule.RuleInput{Frequency: schedule.Weekly, DayOfWeek: ptr(2)})
			checkAllowed(t, "ほかの職員の予定の CreateRecurring", err, tt.editOther)
			_, err = uc.Create(ctx, facilityID, own)
			checkAllowed(t, "自分の予定の Create", err, tt.editSelf)

			uc, _ = newSchedules(authzStore())
			_, err = uc.Update(ctx, targetScheduleID, other)
			checkAllowed(t, "ほかの職員の予定の Update", err, tt.editOther)
			_, err = uc.Update(ctx, ownScheduleID, own)
			checkAllowed(t, "自分の予定の Update", err, tt.editSelf)
			_, err = uc.ChangeOccurrence(ctx, targetRecurringID, civil.Date{Year: 2026, Month: 10, Day: 27}, other)
			checkAllowed(t, "ほかの職員の予定の ChangeOccurrence", err, tt.editOther)
			_, err = uc.Cancel(ctx, targetScheduleID, "体調不良")
			checkAllowed(t, "ほかの職員の予定の Cancel", err, tt.editOther)
		})
	}
}

// TestSchedulesUpdateToOtherStaff は、自分の予定の職員をほかの職員に替えるには、替える先の職員の編集の権限が要ることを確認する。
func TestSchedulesUpdateToOtherStaff(t *testing.T) {
	uc, _ := newSchedules(authzStore())
	if _, err := uc.Update(viewerCtx(staff.PolicyGrant{PolicyCode: organization.ScheduleSelfEdit}), ownScheduleID, normalSlot()); !errors.Is(err, apperr.ErrForbidden) {
		t.Fatalf("err = %v, want ErrForbidden", err)
	}
}
