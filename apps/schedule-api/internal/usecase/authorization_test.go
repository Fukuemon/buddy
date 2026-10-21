package usecase_test

import (
	"context"
	"errors"
	"slices"
	"testing"

	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain/auth"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain/civil"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain/organization"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain/schedule"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain/staff"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/usecase"
)

const (
	viewerID          = "VIEWER"
	viewerTeam        = "TEAM-A"
	targetTeam        = "TEAM-B"
	targetScheduleID  = "TARGET-SCHEDULE"
	ownScheduleID     = "OWN-SCHEDULE"
	targetRecurringID = "TARGET-RECURRING"
)

// authzStore は、閲覧する職員 viewerID（チーム A）と、予定の職員 staffID（チーム B）の予定を持つ store を返す。
func authzStore() *store {
	s := seeded()
	s.staff[viewerID] = staff.Detail{Summary: staff.Summary{Staff: staff.Staff{ID: viewerID, FacilityID: facilityID, TeamID: viewerTeam}}}
	target := s.staff[staffID]
	target.TeamID = targetTeam
	s.staff[staffID] = target
	slot := func(staffID string) schedule.Slot {
		return schedule.Slot{FacilityID: facilityID, StaffID: staffID, TypeID: normalTypeID, Date: civil.Date{Year: 2026, Month: 10, Day: 20},
			StartTime: civil.Time{Hour: 9}, EndTime: civil.Time{Hour: 10}}
	}
	s.schedules[targetScheduleID] = schedule.Detail{Schedule: schedule.Schedule{ID: targetScheduleID, Slot: slot(staffID)}, TypeName: schedule.Normal}
	s.schedules[ownScheduleID] = schedule.Detail{Schedule: schedule.Schedule{ID: ownScheduleID, Slot: slot(viewerID)}, TypeName: schedule.Normal}
	s.recurring[targetRecurringID] = schedule.RecurringDetail{RecurringSchedule: schedule.RecurringSchedule{
		ID: targetRecurringID, Slot: slot(staffID), Rule: schedule.Rule{Frequency: schedule.Weekly},
	}}
	return s
}

func viewerCtx(grants ...staff.PolicyGrant) context.Context {
	return auth.WithPrincipal(context.Background(), auth.Principal{Staff: staff.Detail{
		Summary:  staff.Summary{Staff: staff.Staff{ID: viewerID, FacilityID: facilityID, TeamID: viewerTeam}},
		Policies: grants,
	}})
}

// TestSchedulesAuthorization は、7 つの権限ごとに、ほかの職員の予定の閲覧と編集、自分の予定の編集の許可と拒否を確かめる。
// 見てよくない予定は一覧から除き、1 件を指す操作は domain.ErrForbidden を返す。
func TestSchedulesAuthorization(t *testing.T) {
	tests := []struct {
		name      string
		grants    []staff.PolicyGrant
		readOther bool
		editOther bool
		editSelf  bool
	}{
		{"権限なし", nil, false, false, false},
		{"自分の予定の編集", []staff.PolicyGrant{{PolicyCode: organization.ScheduleSelfEdit}}, false, false, true},
		{"指定した職員の閲覧", []staff.PolicyGrant{{PolicyCode: organization.ScheduleUserRead, TargetUserIDs: []string{staffID}}}, true, false, false},
		{"指定した職員の編集", []staff.PolicyGrant{{PolicyCode: organization.ScheduleUserEdit, TargetUserIDs: []string{staffID}}}, true, true, false},
		{"指定したチームの閲覧", []staff.PolicyGrant{{PolicyCode: organization.ScheduleTeamRead, TargetTeamIDs: []string{targetTeam}}}, true, false, false},
		{"指定したチームの編集", []staff.PolicyGrant{{PolicyCode: organization.ScheduleTeamEdit, TargetTeamIDs: []string{targetTeam}}}, true, true, false},
		{"全ての閲覧", []staff.PolicyGrant{{PolicyCode: organization.ScheduleAllRead}}, true, false, false},
		{"全ての編集", []staff.PolicyGrant{{PolicyCode: organization.ScheduleAllEdit}}, true, true, true},
		{"所属のチームだけの編集", []staff.PolicyGrant{{PolicyCode: organization.ScheduleTeamEdit, TargetTeamIDs: []string{viewerTeam}}}, false, false, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctx := viewerCtx(tt.grants...)
			check := func(op string, err error, want bool) {
				t.Helper()
				if want && err != nil {
					t.Errorf("%s: err = %v, want 許可", op, err)
				}
				if !want && !errors.Is(err, domain.ErrForbidden) {
					t.Errorf("%s: err = %v, want ErrForbidden", op, err)
				}
			}

			uc, _ := newSchedules(authzStore())
			_, err := uc.Get(ctx, targetScheduleID)
			check("Get", err, tt.readOther)
			_, err = uc.GetRecurring(ctx, targetRecurringID)
			check("GetRecurring", err, tt.readOther)
			if _, err := uc.Get(ctx, ownScheduleID); err != nil {
				t.Errorf("自分の予定の Get: err = %v, want 権限によらず許可", err)
			}

			list, err := uc.List(ctx, facilityID, schedule.ListQuery{})
			if err != nil {
				t.Fatal(err)
			}
			if got := containsSchedule(list.Schedules, targetScheduleID); got != tt.readOther {
				t.Errorf("一覧にほかの職員の予定がある = %v, want %v", got, tt.readOther)
			}
			if !containsSchedule(list.Schedules, ownScheduleID) {
				t.Error("一覧に自分の予定がない")
			}
			if got := slices.ContainsFunc(list.RecurringSchedules, func(d schedule.RecurringDetail) bool { return d.ID == targetRecurringID }); got != tt.readOther {
				t.Errorf("一覧にほかの職員の繰り返しの予定がある = %v, want %v", got, tt.readOther)
			}

			other := normalSlot()
			own := normalSlot()
			own.StaffID = viewerID
			_, err = uc.Create(ctx, facilityID, other)
			check("ほかの職員の予定の Create", err, tt.editOther)
			_, err = uc.CreateRecurring(ctx, facilityID, other, usecase.RuleInput{Frequency: schedule.Weekly, DayOfWeek: ptr(2)})
			check("ほかの職員の予定の CreateRecurring", err, tt.editOther)
			_, err = uc.Create(ctx, facilityID, own)
			check("自分の予定の Create", err, tt.editSelf)

			uc, _ = newSchedules(authzStore())
			_, err = uc.Update(ctx, targetScheduleID, other)
			check("ほかの職員の予定の Update", err, tt.editOther)
			_, err = uc.Update(ctx, ownScheduleID, own)
			check("自分の予定の Update", err, tt.editSelf)
			_, err = uc.ChangeOccurrence(ctx, targetRecurringID, civil.Date{Year: 2026, Month: 10, Day: 27}, other)
			check("ほかの職員の予定の ChangeOccurrence", err, tt.editOther)
			_, err = uc.Cancel(ctx, targetScheduleID, "体調不良")
			check("ほかの職員の予定の Cancel", err, tt.editOther)
		})
	}
}

// TestSchedulesUpdateToOtherStaff は、自分の予定の職員をほかの職員に替えるには、替える先の職員の編集の権限が要ることを確かめる。
func TestSchedulesUpdateToOtherStaff(t *testing.T) {
	uc, _ := newSchedules(authzStore())
	if _, err := uc.Update(viewerCtx(staff.PolicyGrant{PolicyCode: organization.ScheduleSelfEdit}), ownScheduleID, normalSlot()); !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("err = %v, want ErrForbidden", err)
	}
}

func TestSchedulesWithoutPrincipal(t *testing.T) {
	uc, _ := newSchedules(authzStore())
	if _, err := uc.Get(context.Background(), ownScheduleID); !errors.Is(err, domain.ErrForbidden) {
		t.Errorf("Get: err = %v, want ErrForbidden", err)
	}
	if _, err := uc.List(context.Background(), facilityID, schedule.ListQuery{}); !errors.Is(err, domain.ErrForbidden) {
		t.Errorf("List: err = %v, want ErrForbidden", err)
	}
}

func containsSchedule(ds []schedule.Detail, id string) bool {
	return slices.ContainsFunc(ds, func(d schedule.Detail) bool { return d.ID == id })
}
