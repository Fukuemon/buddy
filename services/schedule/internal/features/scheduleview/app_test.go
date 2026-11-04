package scheduleview_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/schedule"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/scheduleview"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/staff"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/visit"
	"github.com/Fukuemon/buddy/services/schedule/internal/inmem"
	"github.com/Fukuemon/buddy/services/schedule/internal/principal"
)

const (
	facilityID      = inmem.FacilityID
	otherFacilityID = inmem.OtherFacilityID
	staffID         = inmem.StaffID
	companionID     = inmem.CompanionID
	otherStaffID    = inmem.OtherStaffID
	patientID       = inmem.PatientID
	codeID          = inmem.CodeID
	categoryID      = inmem.CategoryID
	normalTypeID    = inmem.NormalTypeID
	visitTypeID     = inmem.VisitTypeID
	recurringID     = inmem.RecurringID

	viewerID          = "VIEWER"
	viewerTeam        = "TEAM-A"
	targetTeam        = "TEAM-B"
	targetScheduleID  = "TARGET-SCHEDULE"
	ownScheduleID     = "OWN-SCHEDULE"
	targetRecurringID = "TARGET-RECURRING"
)

func ptr[T any](v T) *T { return &v }

// editorCtx は、事業所の全ての予定を編集できる職員を持つ ctx を返す。権限の判定のほかのテストに使う。
func editorCtx() context.Context {
	return principal.With(context.Background(), principal.Principal{Staff: staff.Detail{
		Summary:  staff.Summary{Staff: staff.Staff{ID: "EDITOR", FacilityID: facilityID}},
		Policies: []staff.PolicyGrant{{PolicyCode: organization.ScheduleAllEdit}},
	}})
}

func viewerCtx(grants ...staff.PolicyGrant) context.Context {
	return principal.With(context.Background(), principal.Principal{Staff: staff.Detail{
		Summary:  staff.Summary{Staff: staff.Staff{ID: viewerID, FacilityID: facilityID, TeamID: viewerTeam}},
		Policies: grants,
	}})
}

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
	s.Schedules[targetScheduleID] = scheduleview.Detail{Schedule: schedule.Schedule{ID: targetScheduleID, Slot: slot(staffID)}, TypeName: schedule.Normal}
	s.Schedules[ownScheduleID] = scheduleview.Detail{Schedule: schedule.Schedule{ID: ownScheduleID, Slot: slot(viewerID)}, TypeName: schedule.Normal}
	s.Recurring[targetRecurringID] = scheduleview.RecurringDetail{RecurringSchedule: schedule.RecurringSchedule{
		ID: targetRecurringID, Slot: slot(staffID), Rule: schedule.Rule{Frequency: schedule.Weekly},
	}}
	return s
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

func normalSlot() schedule.SlotInput {
	return schedule.SlotInput{
		TypeID:    normalTypeID,
		Date:      civil.Date{Year: 2026, Month: 10, Day: 20},
		StartTime: civil.Time{Hour: 17, Minute: 30},
		EndTime:   civil.Time{Hour: 18},
		StaffID:   staffID,
		Title:     ptr("カンファレンス"),
	}
}

func visitSlot(v visit.Input) schedule.SlotInput {
	in := normalSlot()
	in.TypeID = visitTypeID
	in.Title = nil
	in.Visit = &v
	return in
}

func validVisit() visit.Input {
	return visit.Input{
		PatientID: patientID, AssignedStaffID: staffID, CompanionID: ptr(companionID),
		ServiceCodeID: codeID, CategoryIDs: []string{categoryID},
	}
}

// app は、テストが呼ぶ scheduleview の読む操作と、読む予定を用意する schedule の書く操作の Do である。
type app struct {
	Get              func(ctx context.Context, id string) (scheduleview.Detail, error)
	GetRecurring     func(ctx context.Context, id string) (scheduleview.RecurringDetail, error)
	List             func(ctx context.Context, facilityID string, q scheduleview.ListQuery) (scheduleview.Listing, error)
	Create           func(ctx context.Context, facilityID string, in schedule.SlotInput) (schedule.Schedule, error)
	CreateRecurring  func(ctx context.Context, facilityID string, in schedule.SlotInput, rule schedule.RuleInput) (schedule.RecurringSchedule, error)
	ChangeOccurrence func(ctx context.Context, recurringScheduleID string, originalDate civil.Date, in schedule.SlotInput) (schedule.Schedule, error)
	Cancel           func(ctx context.Context, scheduleID, reason string) (schedule.Cancellation, error)
	Update           func(ctx context.Context, scheduleID string, in schedule.SlotInput) (schedule.Schedule, error)
}

// newSchedules は、s を読み書きする操作を、今日を 2026-10-21 にして作る。
func newSchedules(s *inmem.Store) *app {
	tx := &inmem.Tx{}
	ids := &inmem.SeqIDs{}
	facilities := inmem.Facilities{Store: s}
	refs := inmem.StaffRefs{Store: s}
	schedules := inmem.Schedules{Store: s}
	recurring := inmem.RecurringSchedules{Store: s}
	types := inmem.ScheduleTypes{Store: s}
	visits := visit.NewWriter(visit.WriterDeps{
		Staff:        refs,
		Patients:     inmem.Patients{Store: s},
		Infos:        inmem.VisitInfos{Store: s},
		ServiceCodes: inmem.ServiceCodes{Store: s}, Categories: inmem.VisitCategories{Store: s},
	}, ids)
	today := civil.Date{Year: 2026, Month: 10, Day: 21}
	now := func() time.Time { return today.Time().Add(9 * time.Hour) }
	return &app{
		Get:              scheduleview.NewGet(schedules, refs).Do,
		GetRecurring:     scheduleview.NewGetRecurring(recurring, refs).Do,
		List:             scheduleview.NewList(facilities, schedules, recurring, refs).Do,
		Create:           schedule.NewCreate(facilities, schedules, types, refs, facilities, visits, now, nil, tx, ids).Do,
		CreateRecurring:  schedule.NewCreateRecurring(facilities, types, refs, facilities, visits, now, recurring, nil, tx, ids).Do,
		ChangeOccurrence: schedule.NewChangeOccurrence(recurring, refs, facilities, schedules, types, visits, now, nil, tx, ids).Do,
		Cancel:           schedule.NewCancel(schedules, refs, nil, tx, ids).Do,
		Update:           schedule.NewUpdate(schedules, refs, facilities, types, visits, now, nil, tx).Do,
	}
}
