package schedule_test

import (
	"context"
	"errors"
	"maps"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/patient"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/schedule"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/scheduleview"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/staff"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/visit"
	"github.com/Fukuemon/buddy/services/schedule/internal/inmem"
	"github.com/Fukuemon/buddy/services/schedule/internal/kernel"
	"github.com/Fukuemon/buddy/services/schedule/internal/principal"
	"github.com/Fukuemon/buddy/services/schedule/internal/tx"
)

const (
	facilityID      = inmem.FacilityID
	otherFacilityID = inmem.OtherFacilityID
	staffID         = inmem.StaffID
	companionID     = inmem.CompanionID
	otherStaffID    = inmem.OtherStaffID
	patientID       = inmem.PatientID
	otherPatientID  = inmem.OtherPatientID
	codeID          = inmem.CodeID
	categoryID      = inmem.CategoryID
	normalTypeID    = inmem.NormalTypeID
	visitTypeID     = inmem.VisitTypeID
	recurringID     = inmem.RecurringID
)

// editorCtx は、事業所の全ての予定を編集できる職員を持つ ctx を返す。権限の判定のほかのテストに使う。
func editorCtx() context.Context {
	return principal.With(context.Background(), principal.Principal{Staff: principal.Staff{
		ID: "EDITOR", FacilityID: facilityID,
		Policies: []staff.PolicyGrant{{PolicyCode: organization.ScheduleAllEdit}},
	}})
}

// today は、newSchedules の App の今日（2026-10-21）である。
var today = civil.Date{Year: 2026, Month: 10, Day: 21}

func newSchedules(s *inmem.Store) (*app, *inmem.Tx) {
	return newSchedulesWithRefs(s, inmem.StaffRefs{Store: s}, inmem.Facilities{Store: s})
}

func newSchedulesWithRefs(s *inmem.Store, refs schedule.StaffRefs, locks schedule.FacilityLock) (*app, *inmem.Tx) {
	tx := &inmem.Tx{}
	ids := &inmem.SeqIDs{}
	visits := visit.NewWriter(visit.WriterDeps{
		Staff:        inmem.StaffRefs{Store: s},
		Patients:     inmem.Patients{Store: s},
		Infos:        inmem.VisitInfos{Store: s},
		ServiceCodes: inmem.ServiceCodes{Store: s}, Categories: inmem.VisitCategories{Store: s},
	}, ids)
	return build(deps{
		Facilities: inmem.Facilities{Store: s},
		Staff:      refs,
		Locks:      locks,
		Visits:     visits,
		Schedules:  inmem.Schedules{Store: s},
		Recurring:  inmem.RecurringSchedules{Store: s},
		Types:      inmem.ScheduleTypes{Store: s},
		Now:        func() time.Time { return today.Time().Add(9 * time.Hour) },
	}, tx, ids), tx
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

func overnightSlot() schedule.SlotInput {
	in := normalSlot()
	in.StartTime, in.EndTime, in.EndsNextDay = civil.Time{Hour: 22}, civil.Time{Hour: 1}, true
	return in
}

// TestSchedulesEndsNextDay は、翌日に終わる予定を、単発、繰り返し、回の置き換え、変更のそれぞれで保存し、印を返すことを確認する。
func TestSchedulesEndsNextDay(t *testing.T) {
	s := inmem.Seeded()
	uc, _ := newSchedules(s)
	ctx := editorCtx()

	got, err := uc.Create(ctx, facilityID, overnightSlot())
	if err != nil {
		t.Fatal(err)
	}
	if !got.EndsNextDay || got.Date != overnightSlot().Date || got.EndTime != (civil.Time{Hour: 1}) || !got.IsOverTimeWork {
		t.Errorf("got %+v", got.Slot)
	}

	in := overnightSlot()
	in.EndsNextDay = false
	if _, err := uc.Create(ctx, facilityID, in); !errors.Is(err, apperr.ErrInvalidInput) {
		t.Errorf("印のない 22:00 から 1:00: err = %v, want ErrInvalidInput", err)
	}

	rs, err := uc.CreateRecurring(ctx, facilityID, overnightSlot(), schedule.RuleInput{Frequency: schedule.Weekly})
	if err != nil {
		t.Fatal(err)
	}
	if !rs.EndsNextDay {
		t.Errorf("繰り返しの予定の EndsNextDay = false")
	}

	replaced, err := uc.ChangeOccurrence(ctx, rs.ID, civil.Date{Year: 2026, Month: 10, Day: 27}, normalSlot())
	if err != nil {
		t.Fatal(err)
	}
	if replaced.EndsNextDay {
		t.Errorf("置き換えた予定の EndsNextDay = true")
	}

	updated, err := uc.Update(ctx, replaced.ID, overnightSlot())
	if err != nil {
		t.Fatal(err)
	}
	if !updated.EndsNextDay {
		t.Errorf("変えた予定の EndsNextDay = false")
	}
}

// nonVisiting は、stop に渡して、職員を訪問しない職員にする。職員の状態ではない（ADR-0006）。
const nonVisiting staff.Status = "non_visiting"

// stop は、職員 id を休職か退職か、訪問しない職員にする。
func stop(t *testing.T, s *inmem.Store, id string, status staff.Status) {
	t.Helper()
	var err error
	switch status {
	case nonVisiting:
		d := s.Staff[id]
		d.NonVisiting = true
		s.Staff[id] = d
	case staff.StatusOnLeave:
		err = inmem.Staff{Store: s}.StartLeave(context.Background(), id, nil)
	case staff.StatusRetired:
		err = inmem.Staff{Store: s}.Retire(context.Background(), id)
	}
	if err != nil {
		t.Fatal(err)
	}
}

// 予定の作成、職員の変更、繰り返しの予定の作成と回の置き換えは、休職か退職の職員と訪問しない職員を予定の職員、主訪問者、同行者に指すと
// 入力のエラーで拒む（#269 の検証の観点 1、3、ADR-0004、ADR-0006）。
func TestSchedulesRejectInactiveStaff(t *testing.T) {
	slots := map[string]func() schedule.SlotInput{
		"予定の職員": func() schedule.SlotInput {
			in := normalSlot()
			in.StaffID = companionID
			return in
		},
		"主訪問者": func() schedule.SlotInput {
			v := validVisit()
			v.AssignedStaffID, v.CompanionID = companionID, nil
			return visitSlot(v)
		},
		"同行者": func() schedule.SlotInput { return visitSlot(validVisit()) },
	}
	// 操作は、休職か退職にする stopCompanion を、職員を指す前に呼ぶ。
	ops := map[string]func(uc *app, ctx context.Context, in schedule.SlotInput, stopCompanion func()) error{
		"予定の作成": func(uc *app, ctx context.Context, in schedule.SlotInput, stopCompanion func()) error {
			stopCompanion()
			_, err := uc.Create(ctx, facilityID, in)
			return err
		},
		"繰り返しの予定の作成": func(uc *app, ctx context.Context, in schedule.SlotInput, stopCompanion func()) error {
			stopCompanion()
			_, err := uc.CreateRecurring(ctx, facilityID, in, schedule.RuleInput{Frequency: schedule.Weekly, DayOfWeek: ptr(1)})
			return err
		},
		"回の置き換え": func(uc *app, ctx context.Context, in schedule.SlotInput, stopCompanion func()) error {
			stopCompanion()
			_, err := uc.ChangeOccurrence(ctx, recurringID, civil.Date{Year: 2026, Month: 10, Day: 12}, in)
			return err
		},
		"予定の変更": func(uc *app, ctx context.Context, in schedule.SlotInput, stopCompanion func()) error {
			created, err := uc.Create(ctx, facilityID, normalSlot())
			if err != nil {
				return err
			}
			stopCompanion()
			_, err = uc.Update(ctx, created.ID, in)
			return err
		},
	}
	for _, status := range []staff.Status{staff.StatusOnLeave, staff.StatusRetired, nonVisiting} {
		for opName, op := range ops {
			for slotName, slot := range slots {
				t.Run(string(status)+"/"+opName+"/"+slotName, func(t *testing.T) {
					s := inmem.Seeded()
					uc, _ := newSchedules(s)
					var before map[string]scheduleview.Detail
					err := op(uc, editorCtx(), slot(), func() {
						stop(t, s, companionID, status)
						before = maps.Clone(s.Schedules)
					})
					if !errors.Is(err, apperr.ErrInvalidInput) || !strings.Contains(err.Error(), companionID) {
						t.Fatalf("err = %v, want 職員 %s の ErrInvalidInput", err, companionID)
					}
					if !maps.EqualFunc(s.Schedules, before, func(a, b scheduleview.Detail) bool { return a.Schedule == b.Schedule }) {
						t.Error("拒んだのに予定が変わった")
					}
					if _, ok := s.Recurring[recurringID]; !ok || len(s.Recurring) != 1 {
						t.Errorf("繰り返しの予定 = %d 件, want 1 件", len(s.Recurring))
					}
				})
			}
		}
	}
}

// 休職か退職か訪問しない職員に割り振った予定と、繰り返しの予定の回は、職員を変えずに保存できる（#269 の検証の観点 2）。
func TestSchedulesKeepInactiveStaff(t *testing.T) {
	for _, status := range []staff.Status{staff.StatusOnLeave, staff.StatusRetired, nonVisiting} {
		t.Run(string(status), func(t *testing.T) {
			s := inmem.Seeded()
			uc, _ := newSchedules(s)
			ctx := editorCtx()
			created, err := uc.Create(ctx, facilityID, visitSlot(validVisit()))
			if err != nil {
				t.Fatal(err)
			}
			stop(t, s, staffID, status)
			stop(t, s, companionID, status)
			in := visitSlot(validVisit())
			in.StartTime, in.EndTime = civil.Time{Hour: 10}, civil.Time{Hour: 11}
			got, err := uc.Update(ctx, created.ID, in)
			if err != nil {
				t.Fatalf("職員を変えずに保存: err = %v", err)
			}
			if got.StartTime != in.StartTime || got.StaffID != staffID {
				t.Errorf("got %+v", got)
			}
			// 繰り返しの予定の職員のまま、回の時刻だけを変える
			if _, err := uc.ChangeOccurrence(ctx, recurringID, civil.Date{Year: 2026, Month: 10, Day: 12}, normalSlot()); err != nil {
				t.Fatalf("回の職員を変えずに保存: err = %v", err)
			}
			// 同行者を外しても、残る主訪問者と予定の職員は割り振ったまま保存できる
			v := validVisit()
			v.CompanionID = nil
			if _, err := uc.Update(ctx, created.ID, visitSlot(v)); err != nil {
				t.Fatalf("同行者を外して保存: err = %v", err)
			}
		})
	}
}

// 既に割り振った職員は、同じ役割のときだけ割り振ったまま保存できる。退職した職員は、今日より前の予定でだけ保存できる。
func TestSchedulesKeepRulesForInactiveStaff(t *testing.T) {
	tests := []struct {
		name    string
		status  staff.Status
		change  func(uc *app, ctx context.Context, createdID string) error
		wantErr bool
	}{
		{name: "休職の職員の予定を今日に動かす", status: staff.StatusOnLeave, change: func(uc *app, ctx context.Context, id string) error {
			in := visitSlot(validVisit())
			in.Date = today
			_, err := uc.Update(ctx, id, in)
			return err
		}},
		{name: "退職した職員の予定を今日に動かす", status: staff.StatusRetired, wantErr: true, change: func(uc *app, ctx context.Context, id string) error {
			in := visitSlot(validVisit())
			in.Date = today
			_, err := uc.Update(ctx, id, in)
			return err
		}},
		{name: "退職した職員の繰り返しの回を今日の予定に置き換える", status: staff.StatusRetired, wantErr: true, change: func(uc *app, ctx context.Context, _ string) error {
			in := normalSlot()
			in.Date = today
			_, err := uc.ChangeOccurrence(ctx, recurringID, civil.Date{Year: 2026, Month: 10, Day: 12}, in)
			return err
		}},
		{name: "休職の同行者を主訪問者に移す", status: staff.StatusOnLeave, wantErr: true, change: func(uc *app, ctx context.Context, id string) error {
			v := validVisit()
			v.AssignedStaffID, v.CompanionID = companionID, ptr(staffID)
			_, err := uc.Update(ctx, id, visitSlot(v))
			return err
		}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := inmem.Seeded()
			uc, _ := newSchedules(s)
			ctx := editorCtx()
			created, err := uc.Create(ctx, facilityID, visitSlot(validVisit()))
			if err != nil {
				t.Fatal(err)
			}
			stop(t, s, staffID, tt.status)
			stop(t, s, companionID, tt.status)
			err = tt.change(uc, ctx, created.ID)
			if tt.wantErr != errors.Is(err, apperr.ErrInvalidInput) || (!tt.wantErr && err != nil) {
				t.Fatalf("err = %v, want 入力のエラー: %v", err, tt.wantErr)
			}
		})
	}
}

// 利用の終了の利用者は、新しい予定に指せない。既に付けた予定は、利用者を変えずに、今日より前の日付でだけ保存できる（ADR-0005）。
func TestSchedulesEndedPatient(t *testing.T) {
	const activePatientID = "ACTIVEPATIENT"
	tests := []struct {
		name    string
		change  func(uc *app, ctx context.Context, createdID string) error
		wantErr bool
	}{
		{name: "利用の終了の利用者に予定を作る", wantErr: true, change: func(uc *app, ctx context.Context, _ string) error {
			_, err := uc.Create(ctx, facilityID, visitSlot(validVisit()))
			return err
		}},
		{name: "利用の終了の利用者に繰り返しの予定を作る", wantErr: true, change: func(uc *app, ctx context.Context, _ string) error {
			_, err := uc.CreateRecurring(ctx, facilityID, visitSlot(validVisit()), schedule.RuleInput{Frequency: schedule.Weekly})
			return err
		}},
		{name: "予定の利用者を利用の終了の利用者に変える", wantErr: true, change: func(uc *app, ctx context.Context, _ string) error {
			v := validVisit()
			v.PatientID = activePatientID
			other, err := uc.Create(ctx, facilityID, visitSlot(v))
			if err != nil {
				return err
			}
			_, err = uc.Update(ctx, other.ID, visitSlot(validVisit()))
			return err
		}},
		{name: "利用者を変えずに過去の予定の時刻を変える", change: func(uc *app, ctx context.Context, id string) error {
			in := visitSlot(validVisit())
			in.StartTime, in.EndTime = civil.Time{Hour: 10}, civil.Time{Hour: 11}
			_, err := uc.Update(ctx, id, in)
			return err
		}},
		{name: "利用者を変えずに過去の予定を今日に動かす", wantErr: true, change: func(uc *app, ctx context.Context, id string) error {
			in := visitSlot(validVisit())
			in.Date = today
			_, err := uc.Update(ctx, id, in)
			return err
		}},
		{name: "過去の予定の利用者を利用中の利用者に変える", change: func(uc *app, ctx context.Context, id string) error {
			v := validVisit()
			v.PatientID = activePatientID
			_, err := uc.Update(ctx, id, visitSlot(v))
			return err
		}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := inmem.Seeded()
			s.Patients[activePatientID] = patient.Detail{Patient: patient.Patient{ID: activePatientID, FacilityID: facilityID}}
			uc, _ := newSchedules(s)
			ctx := editorCtx()
			created, err := uc.Create(ctx, facilityID, visitSlot(validVisit()))
			if err != nil {
				t.Fatal(err)
			}
			if err := (inmem.Patients{Store: s}).End(ctx, patientID); err != nil {
				t.Fatal(err)
			}
			err = tt.change(uc, ctx, created.ID)
			if tt.wantErr != errors.Is(err, apperr.ErrInvalidInput) || (!tt.wantErr && err != nil) {
				t.Fatalf("err = %v, want 入力のエラー: %v", err, tt.wantErr)
			}
		})
	}
}

// lockOrder は、職員の参照と事業所のロックの呼び出しの順を記録する。
type lockOrder struct {
	inmem.StaffRefs
	inmem.Facilities
	calls *[]string
}

func (r lockOrder) Get(ctx context.Context, id string) (staff.Ref, error) {
	*r.calls = append(*r.calls, "Get")
	return r.StaffRefs.Get(ctx, id)
}

func (r lockOrder) GetForShare(ctx context.Context, facilityID string) (organization.Facility, error) {
	*r.calls = append(*r.calls, "GetForShare")
	return r.Facilities.GetForShare(ctx, facilityID)
}

// 職員の状態を読む前に、事業所の職員の休職と退職を待たせるロックを取る。
func TestSchedulesShareFacilityBeforeReadingStaff(t *testing.T) {
	s := inmem.Seeded()
	var calls []string
	lo := lockOrder{StaffRefs: inmem.StaffRefs{Store: s}, Facilities: inmem.Facilities{Store: s}, calls: &calls}
	uc, _ := newSchedulesWithRefs(s, lo, lo)
	if _, err := uc.Create(editorCtx(), facilityID, visitSlot(validVisit())); err != nil {
		t.Fatal(err)
	}
	if len(calls) == 0 || calls[0] != "GetForShare" || slices.Index(calls[1:], "GetForShare") >= 0 {
		t.Errorf("呼び出しの順 = %v, want GetForShare を最初に 1 回", calls)
	}
}

// deps は、テストが schedule の操作の型に渡す依存である。テストが使わない依存は nil のままにする。
type deps struct {
	Facilities kernel.Finder[organization.Facility]
	Staff      schedule.StaffRefs
	Locks      schedule.FacilityLock
	Visits     schedule.VisitInfos
	Schedules  schedule.Repository
	Recurring  schedule.RecurringRepository
	Types      schedule.TypeRepository
	Exports    schedule.Exports
	Now        func() time.Time
}

// app は、テストが呼ぶ schedule の操作の Do である。
type app struct {
	ListTypes        func(ctx context.Context) ([]schedule.Type, error)
	Create           func(ctx context.Context, facilityID string, in schedule.SlotInput) (schedule.Schedule, error)
	CreateRecurring  func(ctx context.Context, facilityID string, in schedule.SlotInput, rule schedule.RuleInput) (schedule.RecurringSchedule, error)
	ChangeOccurrence func(ctx context.Context, recurringScheduleID string, originalDate civil.Date, in schedule.SlotInput) (schedule.Schedule, error)
	ChangeRule       func(ctx context.Context, recurringScheduleID string, effective *civil.Date, rule schedule.RuleInput) (schedule.RecurringSchedule, error)
	Cancel           func(ctx context.Context, scheduleID, reason string) (schedule.Cancellation, error)
	Update           func(ctx context.Context, scheduleID string, in schedule.SlotInput) (schedule.Schedule, error)
}

// build は、d の依存で schedule の全ての操作の型を作る。
func build(d deps, tx tx.Transactor, ids kernel.IDGenerator) *app {
	return &app{
		ListTypes:        schedule.NewListTypes(d.Types).Do,
		Create:           schedule.NewCreate(d.Facilities, d.Schedules, d.Types, d.Staff, d.Locks, d.Visits, d.Now, d.Exports, tx, ids).Do,
		CreateRecurring:  schedule.NewCreateRecurring(d.Facilities, d.Types, d.Staff, d.Locks, d.Visits, d.Now, d.Recurring, d.Exports, tx, ids).Do,
		ChangeOccurrence: schedule.NewChangeOccurrence(d.Recurring, d.Staff, d.Locks, d.Schedules, d.Types, d.Visits, d.Now, d.Exports, tx, ids).Do,
		ChangeRule:       schedule.NewChangeRule(d.Recurring, d.Staff, d.Locks, d.Types, d.Visits, d.Now, d.Exports, tx, ids).Do,
		Cancel:           schedule.NewCancel(d.Schedules, d.Staff, d.Locks, d.Exports, tx, ids).Do,
		Update:           schedule.NewUpdate(d.Schedules, d.Staff, d.Locks, d.Types, d.Visits, d.Now, d.Exports, tx).Do,
	}
}
