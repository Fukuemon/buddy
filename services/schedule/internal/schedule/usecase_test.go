package schedule_test

import (
	"context"
	"errors"
	"maps"
	"strings"
	"testing"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/inmem"
	"github.com/Fukuemon/buddy/services/schedule/internal/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/principal"
	"github.com/Fukuemon/buddy/services/schedule/internal/schedule"
	"github.com/Fukuemon/buddy/services/schedule/internal/staff"
	"github.com/Fukuemon/buddy/services/schedule/internal/visit"
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

func newSchedules(s *inmem.Store) (*schedule.Usecase, *inmem.Tx) {
	tx := &inmem.Tx{}
	ids := &inmem.SeqIDs{}
	visits := visit.NewWriter(visit.WriterDeps{
		Staff: inmem.StaffRefs{Store: s},
		Patients: func(ctx context.Context, id string) (string, string, error) {
			pa, err := inmem.Patients{Store: s}.Get(ctx, id)
			return pa.ID, pa.FacilityID, err
		},
		Infos:   inmem.VisitInfos{Store: s},
		Masters: inmem.VisitMasters{Store: s},
	}, ids)
	return schedule.NewUsecase(schedule.Deps{
		Facilities: inmem.Facilities{Store: s},
		Staff:      inmem.StaffRefs{Store: s},
		Visits:     visits,
		Schedules:  inmem.Schedules{Store: s},
		Recurring:  inmem.RecurringSchedules{Store: s},
		Types:      inmem.ScheduleTypes{Store: s},
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

// stop は、職員 id を休職か退職にする。
func stop(t *testing.T, s *inmem.Store, id string, status staff.Status) {
	t.Helper()
	var err error
	switch status {
	case staff.StatusOnLeave:
		err = inmem.Staff{Store: s}.StartLeave(context.Background(), id, nil)
	case staff.StatusRetired:
		err = inmem.Staff{Store: s}.Retire(context.Background(), id)
	}
	if err != nil {
		t.Fatal(err)
	}
}

// 予定の作成、職員の変更、繰り返しの予定の作成と回の置き換えは、休職か退職の職員を予定の職員、主訪問者、同行者に指すと
// 入力のエラーで拒む（#269 の検証の観点 1、3）。
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
	for _, status := range []staff.Status{staff.StatusOnLeave, staff.StatusRetired} {
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

// 休職か退職の職員に割り振った予定と、繰り返しの予定の回は、職員を変えずに保存できる（#269 の検証の観点 2）。
func TestSchedulesKeepInactiveStaff(t *testing.T) {
	for _, status := range []staff.Status{staff.StatusOnLeave, staff.StatusRetired} {
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
