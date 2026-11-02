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
	otherPatientID  = inmem.OtherPatientID
	codeID          = inmem.CodeID
	categoryID      = inmem.CategoryID
	normalTypeID    = inmem.NormalTypeID
	visitTypeID     = inmem.VisitTypeID
	recurringID     = inmem.RecurringID
)

// editorCtx は、事業所の全ての予定を編集できる職員を持つ ctx を返す。権限の判定のほかのテストに使う。
func editorCtx() context.Context {
	return principal.With(context.Background(), principal.Principal{Staff: staff.Detail{
		Summary:  staff.Summary{Staff: staff.Staff{ID: "EDITOR", FacilityID: facilityID}},
		Policies: []staff.PolicyGrant{{PolicyCode: organization.ScheduleAllEdit}},
	}})
}

// today は、newSchedules の Usecase の今日（2026-10-21）である。
var today = civil.Date{Year: 2026, Month: 10, Day: 21}

func newSchedules(s *inmem.Store) (*schedule.Usecase, *inmem.Tx) {
	return newSchedulesWithRefs(s, inmem.StaffRefs{Store: s})
}

func newSchedulesWithRefs(s *inmem.Store, refs schedule.StaffRefs) (*schedule.Usecase, *inmem.Tx) {
	tx := &inmem.Tx{}
	ids := &inmem.SeqIDs{}
	visits := visit.NewWriter(visit.WriterDeps{
		Staff:    inmem.StaffRefs{Store: s},
		Patients: patient.VisitFinder(inmem.Patients{Store: s}),
		Infos:    inmem.VisitInfos{Store: s},
		Masters:  inmem.VisitMasters{Store: s},
	}, ids)
	return schedule.NewUsecase(schedule.Deps{
		Facilities: inmem.Facilities{Store: s},
		Staff:      refs,
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

func TestSchedulesCreate(t *testing.T) {
	tests := []struct {
		name       string
		facilityID string
		in         func() schedule.SlotInput
		wantErr    error
		wantInfos  int
	}{
		{name: "通常の予定", facilityID: facilityID, in: normalSlot},
		{name: "訪問の予定", facilityID: facilityID, in: func() schedule.SlotInput { return visitSlot(validVisit()) }, wantInfos: 1},
		{name: "事業所がない", facilityID: "MISSING", in: normalSlot, wantErr: apperr.ErrNotFound},
		{name: "予定の種類がない", facilityID: facilityID, in: func() schedule.SlotInput {
			in := normalSlot()
			in.TypeID = "MISSING"
			return in
		}, wantErr: apperr.ErrInvalidInput},
		{name: "別の事業所の職員", facilityID: facilityID, in: func() schedule.SlotInput {
			in := normalSlot()
			in.StaffID = otherStaffID
			return in
		}, wantErr: apperr.ErrInvalidInput},
		{name: "通常の予定に訪問の情報", facilityID: facilityID, in: func() schedule.SlotInput {
			in := normalSlot()
			v := validVisit()
			in.Visit = &v
			return in
		}, wantErr: apperr.ErrInvalidInput},
		{name: "別の事業所の利用者", facilityID: facilityID, in: func() schedule.SlotInput {
			v := validVisit()
			v.PatientID = otherPatientID
			return visitSlot(v)
		}, wantErr: apperr.ErrInvalidInput},
		{name: "別の事業所の同行者", facilityID: facilityID, in: func() schedule.SlotInput {
			v := validVisit()
			v.CompanionID = ptr(otherStaffID)
			return visitSlot(v)
		}, wantErr: apperr.ErrInvalidInput},
		{name: "訪問の区分がない", facilityID: facilityID, in: func() schedule.SlotInput {
			v := validVisit()
			v.CategoryIDs = []string{"MISSING"}
			return visitSlot(v)
		}, wantErr: apperr.ErrInvalidInput},
		{name: "サービスコードがない", facilityID: facilityID, in: func() schedule.SlotInput {
			v := validVisit()
			v.ServiceCodeID = "MISSING"
			return visitSlot(v)
		}, wantErr: apperr.ErrInvalidInput},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := inmem.Seeded()
			uc, tx := newSchedules(s)
			got, err := uc.Create(editorCtx(), tt.facilityID, tt.in())
			if tt.wantErr != nil {
				if !errors.Is(err, tt.wantErr) {
					t.Fatalf("err = %v, want %v", err, tt.wantErr)
				}
				if len(s.Schedules) != 0 {
					t.Errorf("予定が %d 件保存された", len(s.Schedules))
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			if tx.Calls != 1 {
				t.Errorf("トランザクションの回数 = %d", tx.Calls)
			}
			if got.FacilityID != facilityID || got.StaffID != staffID {
				t.Errorf("got %+v", got.Schedule)
			}
			if !got.IsOverTimeWork {
				t.Error("17 時 30 分に始まる予定が時間外にならない")
			}
			if len(s.Infos) != tt.wantInfos {
				t.Errorf("訪問の情報 = %d 件, want %d", len(s.Infos), tt.wantInfos)
			}
			if tt.wantInfos > 0 && (got.VisitInfoID == nil || s.Infos[*got.VisitInfoID].PatientID != patientID) {
				t.Errorf("VisitInfoID = %v", got.VisitInfoID)
			}
		})
	}
}

func TestSchedulesCreateRecurring(t *testing.T) {
	s := inmem.Seeded()
	uc, _ := newSchedules(s)
	got, err := uc.CreateRecurring(editorCtx(), facilityID, normalSlot(),
		schedule.RuleInput{Frequency: schedule.Weekly, DayOfWeek: ptr(2)})
	if err != nil {
		t.Fatal(err)
	}
	if got.Rule.Frequency != schedule.Weekly || got.Rule.DayOfWeek == nil || *got.Rule.DayOfWeek != 2 {
		t.Errorf("Rule = %+v", got.Rule)
	}

	_, err = uc.CreateRecurring(editorCtx(), facilityID, normalSlot(),
		schedule.RuleInput{Frequency: schedule.Monthly, DayOfWeek: ptr(2)})
	if !errors.Is(err, apperr.ErrInvalidInput) {
		t.Fatalf("err = %v, want ErrInvalidInput", err)
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

	created, err := uc.Create(ctx, facilityID, overnightSlot())
	if err != nil {
		t.Fatal(err)
	}
	got, err := uc.Get(ctx, created.ID)
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

func TestSchedulesChangeOccurrence(t *testing.T) {
	monday := civil.Date{Year: 2026, Month: 10, Day: 12}
	tests := []struct {
		name        string
		recurringID string
		date        civil.Date
		repeat      bool
		wantErr     error
		wantMsg     string
	}{
		{name: "回を置き換える", recurringID: recurringID, date: monday},
		{name: "同じ回を 2 度置き換える", recurringID: recurringID, date: monday, repeat: true, wantErr: apperr.ErrConflict,
			wantMsg: "2026-10-12 の回はすでに置き換えられています"},
		{name: "回に当たらない日", recurringID: recurringID, date: civil.Date{Year: 2026, Month: 10, Day: 13}, wantErr: apperr.ErrInvalidInput},
		{name: "繰り返しの予定がない", recurringID: "MISSING", date: monday, wantErr: apperr.ErrNotFound},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := inmem.Seeded()
			uc, _ := newSchedules(s)
			ctx := editorCtx()
			if tt.repeat {
				if _, err := uc.ChangeOccurrence(ctx, tt.recurringID, tt.date, normalSlot()); err != nil {
					t.Fatal(err)
				}
			}
			got, err := uc.ChangeOccurrence(ctx, tt.recurringID, tt.date, normalSlot())
			if tt.wantErr != nil {
				if !errors.Is(err, tt.wantErr) {
					t.Fatalf("err = %v, want %v", err, tt.wantErr)
				}
				if tt.wantMsg != "" && err.Error() != tt.wantMsg {
					t.Errorf("message = %q, want %q", err.Error(), tt.wantMsg)
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			if got.RecurringScheduleID == nil || *got.RecurringScheduleID != recurringID {
				t.Errorf("RecurringScheduleID = %v", got.RecurringScheduleID)
			}
			if got.OriginalDate == nil || *got.OriginalDate != tt.date {
				t.Errorf("OriginalDate = %v, want %v", got.OriginalDate, tt.date)
			}
			if ex := s.Recurring[recurringID].ExclusionDates; len(ex) != 1 || ex[0] != tt.date {
				t.Errorf("ExclusionDates = %v", ex)
			}
		})
	}
}

func TestSchedulesCancel(t *testing.T) {
	s := inmem.Seeded()
	uc, tx := newSchedules(s)
	ctx := editorCtx()
	created, err := uc.Create(ctx, facilityID, normalSlot())
	if err != nil {
		t.Fatal(err)
	}
	before := tx.Calls
	if _, err := uc.Cancel(ctx, "MISSING", "体調不良"); !errors.Is(err, apperr.ErrNotFound) {
		t.Fatalf("err = %v, want ErrNotFound", err)
	}
	if _, err := uc.Cancel(ctx, created.ID, ""); !errors.Is(err, apperr.ErrInvalidInput) {
		t.Fatalf("err = %v, want ErrInvalidInput", err)
	}
	if _, err := uc.Cancel(ctx, created.ID, "体調不良"); err != nil {
		t.Fatal(err)
	}
	if tx.Calls == before {
		t.Error("キャンセルがトランザクションの中で予定をロックしていない")
	}
	if _, err := uc.Cancel(ctx, created.ID, "体調不良"); !errors.Is(err, apperr.ErrConflict) || err.Error() != "この予定はすでにキャンセルされています" {
		t.Fatalf("err = %v, want キャンセル済みの ErrConflict", err)
	}
}

func TestSchedulesUpdate(t *testing.T) {
	tests := []struct {
		name      string
		in        func() schedule.SlotInput
		cancel    bool
		missing   bool
		single    bool
		wantErr   error
		wantMsg   string
		wantInfos int
	}{
		{name: "訪問の予定を通常の予定にすると訪問の情報を消す", in: normalSlot},
		{name: "訪問の情報を作り直す", in: func() schedule.SlotInput { return visitSlot(validVisit()) }, wantInfos: 1},
		{name: "繰り返しに属さない予定", in: normalSlot, single: true},
		{name: "キャンセル済み", in: normalSlot, cancel: true, wantErr: apperr.ErrConflict, wantMsg: "キャンセル済みの予定は変えられません", wantInfos: 1},
		{name: "予定がない", in: normalSlot, missing: true, wantErr: apperr.ErrNotFound, wantInfos: 1},
		{name: "別の事業所の職員", in: func() schedule.SlotInput {
			in := normalSlot()
			in.StaffID = otherStaffID
			return in
		}, wantErr: apperr.ErrInvalidInput, wantInfos: 1},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := inmem.Seeded()
			uc, tx := newSchedules(s)
			ctx := editorCtx()
			create := func() (schedule.Detail, error) {
				return uc.ChangeOccurrence(ctx, recurringID, civil.Date{Year: 2026, Month: 10, Day: 12}, visitSlot(validVisit()))
			}
			if tt.single {
				create = func() (schedule.Detail, error) { return uc.Create(ctx, facilityID, visitSlot(validVisit())) }
			}
			created, err := create()
			if err != nil {
				t.Fatal(err)
			}
			if tt.cancel {
				if _, err := uc.Cancel(ctx, created.ID, "体調不良"); err != nil {
					t.Fatal(err)
				}
			}
			id := created.ID
			if tt.missing {
				id = "MISSING"
			}
			calls := tx.Calls
			got, err := uc.Update(ctx, id, tt.in())
			if len(s.Infos) != tt.wantInfos {
				t.Errorf("訪問の情報 = %d 件, want %d", len(s.Infos), tt.wantInfos)
			}
			if tt.wantErr != nil {
				if !errors.Is(err, tt.wantErr) {
					t.Fatalf("err = %v, want %v", err, tt.wantErr)
				}
				if tt.wantMsg != "" && err.Error() != tt.wantMsg {
					t.Errorf("message = %q, want %q", err.Error(), tt.wantMsg)
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			if tx.Calls != calls+1 {
				t.Errorf("トランザクションの回数 = %d", tx.Calls-calls)
			}
			if got.ID != created.ID || got.TypeID != tt.in().TypeID {
				t.Errorf("got %+v", got.Schedule)
			}
			if tt.single != (got.RecurringScheduleID == nil) || (!tt.single && *got.RecurringScheduleID != recurringID) {
				t.Errorf("RecurringScheduleID = %v", got.RecurringScheduleID)
			}
			if tt.wantInfos > 0 && (got.VisitInfoID == nil || *got.VisitInfoID == *created.VisitInfoID) {
				t.Errorf("VisitInfoID = %v, 前は %v", got.VisitInfoID, created.VisitInfoID)
			}
		})
	}
}

func TestSchedulesList(t *testing.T) {
	s := inmem.Seeded()
	uc, _ := newSchedules(s)
	ctx := editorCtx()
	from, to := civil.Date{Year: 2026, Month: 10, Day: 20}, civil.Date{Year: 2026, Month: 10, Day: 1}
	if _, err := uc.List(ctx, facilityID, schedule.ListQuery{DateFrom: &from, DateTo: &to}); !errors.Is(err, apperr.ErrInvalidInput) {
		t.Fatalf("err = %v, want ErrInvalidInput", err)
	}
	if _, err := uc.List(ctx, "MISSING", schedule.ListQuery{}); !errors.Is(err, apperr.ErrNotFound) {
		t.Fatalf("err = %v, want ErrNotFound", err)
	}
}

// nonVisiting は、stop に渡して、職員を訪問しない職員にする。職員の状態ではない（ADR-0022）。
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
// 入力のエラーで拒む（#269 の検証の観点 1、3、ADR-0022）。
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
	ops := map[string]func(uc *schedule.Usecase, ctx context.Context, in schedule.SlotInput, stopCompanion func()) error{
		"予定の作成": func(uc *schedule.Usecase, ctx context.Context, in schedule.SlotInput, stopCompanion func()) error {
			stopCompanion()
			_, err := uc.Create(ctx, facilityID, in)
			return err
		},
		"繰り返しの予定の作成": func(uc *schedule.Usecase, ctx context.Context, in schedule.SlotInput, stopCompanion func()) error {
			stopCompanion()
			_, err := uc.CreateRecurring(ctx, facilityID, in, schedule.RuleInput{Frequency: schedule.Weekly, DayOfWeek: ptr(1)})
			return err
		},
		"回の置き換え": func(uc *schedule.Usecase, ctx context.Context, in schedule.SlotInput, stopCompanion func()) error {
			stopCompanion()
			_, err := uc.ChangeOccurrence(ctx, recurringID, civil.Date{Year: 2026, Month: 10, Day: 12}, in)
			return err
		},
		"予定の変更": func(uc *schedule.Usecase, ctx context.Context, in schedule.SlotInput, stopCompanion func()) error {
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
					var before map[string]schedule.Detail
					err := op(uc, editorCtx(), slot(), func() {
						stop(t, s, companionID, status)
						before = maps.Clone(s.Schedules)
					})
					if !errors.Is(err, apperr.ErrInvalidInput) || !strings.Contains(err.Error(), companionID) {
						t.Fatalf("err = %v, want 職員 %s の ErrInvalidInput", err, companionID)
					}
					if !maps.EqualFunc(s.Schedules, before, func(a, b schedule.Detail) bool { return a.Schedule == b.Schedule }) {
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
				t.Errorf("got %+v", got.Schedule)
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
		change  func(uc *schedule.Usecase, ctx context.Context, createdID string) error
		wantErr bool
	}{
		{name: "休職の職員の予定を今日に動かす", status: staff.StatusOnLeave, change: func(uc *schedule.Usecase, ctx context.Context, id string) error {
			in := visitSlot(validVisit())
			in.Date = today
			_, err := uc.Update(ctx, id, in)
			return err
		}},
		{name: "退職した職員の予定を今日に動かす", status: staff.StatusRetired, wantErr: true, change: func(uc *schedule.Usecase, ctx context.Context, id string) error {
			in := visitSlot(validVisit())
			in.Date = today
			_, err := uc.Update(ctx, id, in)
			return err
		}},
		{name: "退職した職員の繰り返しの回を今日の予定に置き換える", status: staff.StatusRetired, wantErr: true, change: func(uc *schedule.Usecase, ctx context.Context, _ string) error {
			in := normalSlot()
			in.Date = today
			_, err := uc.ChangeOccurrence(ctx, recurringID, civil.Date{Year: 2026, Month: 10, Day: 12}, in)
			return err
		}},
		{name: "休職の同行者を主訪問者に移す", status: staff.StatusOnLeave, wantErr: true, change: func(uc *schedule.Usecase, ctx context.Context, id string) error {
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

// 利用の終了の利用者は、新しい予定に指せない。既に付けた予定は、利用者を変えずに、今日より前の日付でだけ保存できる（ADR-0021）。
func TestSchedulesEndedPatient(t *testing.T) {
	const activePatientID = "ACTIVEPATIENT"
	tests := []struct {
		name    string
		change  func(uc *schedule.Usecase, ctx context.Context, createdID string) error
		wantErr bool
	}{
		{name: "利用の終了の利用者に予定を作る", wantErr: true, change: func(uc *schedule.Usecase, ctx context.Context, _ string) error {
			_, err := uc.Create(ctx, facilityID, visitSlot(validVisit()))
			return err
		}},
		{name: "利用の終了の利用者に繰り返しの予定を作る", wantErr: true, change: func(uc *schedule.Usecase, ctx context.Context, _ string) error {
			_, err := uc.CreateRecurring(ctx, facilityID, visitSlot(validVisit()), schedule.RuleInput{Frequency: schedule.Weekly})
			return err
		}},
		{name: "予定の利用者を利用の終了の利用者に変える", wantErr: true, change: func(uc *schedule.Usecase, ctx context.Context, _ string) error {
			v := validVisit()
			v.PatientID = activePatientID
			other, err := uc.Create(ctx, facilityID, visitSlot(v))
			if err != nil {
				return err
			}
			_, err = uc.Update(ctx, other.ID, visitSlot(validVisit()))
			return err
		}},
		{name: "利用者を変えずに過去の予定の時刻を変える", change: func(uc *schedule.Usecase, ctx context.Context, id string) error {
			in := visitSlot(validVisit())
			in.StartTime, in.EndTime = civil.Time{Hour: 10}, civil.Time{Hour: 11}
			_, err := uc.Update(ctx, id, in)
			return err
		}},
		{name: "利用者を変えずに過去の予定を今日に動かす", wantErr: true, change: func(uc *schedule.Usecase, ctx context.Context, id string) error {
			in := visitSlot(validVisit())
			in.Date = today
			_, err := uc.Update(ctx, id, in)
			return err
		}},
		{name: "過去の予定の利用者を利用中の利用者に変える", change: func(uc *schedule.Usecase, ctx context.Context, id string) error {
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

// lockOrder は、職員の参照の呼び出しの順を記録する。
type lockOrder struct {
	inmem.StaffRefs
	calls *[]string
}

func (r lockOrder) Get(ctx context.Context, id string) (staff.Ref, error) {
	*r.calls = append(*r.calls, "Get")
	return r.StaffRefs.Get(ctx, id)
}

func (r lockOrder) LockStatuses(ctx context.Context, facilityID string) error {
	*r.calls = append(*r.calls, "LockStatuses")
	return r.StaffRefs.LockStatuses(ctx, facilityID)
}

// 職員の状態を読む前に、事業所の職員の休職と退職を待たせるロックを取る。
func TestSchedulesLockStatusesBeforeReadingStaff(t *testing.T) {
	s := inmem.Seeded()
	var calls []string
	uc, _ := newSchedulesWithRefs(s, lockOrder{StaffRefs: inmem.StaffRefs{Store: s}, calls: &calls})
	if _, err := uc.Create(editorCtx(), facilityID, visitSlot(validVisit())); err != nil {
		t.Fatal(err)
	}
	if len(calls) == 0 || calls[0] != "LockStatuses" || slices.Index(calls[1:], "LockStatuses") >= 0 {
		t.Errorf("呼び出しの順 = %v, want LockStatuses を最初に 1 回", calls)
	}
}
