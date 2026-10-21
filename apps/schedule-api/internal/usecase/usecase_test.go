package usecase_test

import (
	"context"
	"errors"
	"testing"

	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain/auth"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain/civil"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain/organization"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain/patient"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain/schedule"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain/staff"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain/visit"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/usecase"
)

const (
	facilityID      = "FACILITY"
	otherFacilityID = "OTHER"
	staffID         = "STAFF"
	companionID     = "COMPANION"
	otherStaffID    = "OTHERSTAFF"
	patientID       = "PATIENT"
	otherPatientID  = "OTHERPATIENT"
	codeID          = "CODE"
	categoryID      = "CATEGORY"
	normalTypeID    = "NORMAL"
	visitTypeID     = "VISIT"
	recurringID     = "RECURRING"
)

func ptr[T any](v T) *T { return &v }

func seeded() *store {
	s := newStore()
	s.facilities[facilityID] = organization.Facility{ID: facilityID}
	s.facilities[otherFacilityID] = organization.Facility{ID: otherFacilityID}
	for id, fid := range map[string]string{staffID: facilityID, companionID: facilityID, otherStaffID: otherFacilityID} {
		s.staff[id] = staff.Detail{Summary: staff.Summary{Staff: staff.Staff{ID: id, FacilityID: fid}}}
	}
	s.patients[patientID] = patient.Detail{Patient: patient.Patient{ID: patientID, FacilityID: facilityID}}
	s.patients[otherPatientID] = patient.Detail{Patient: patient.Patient{ID: otherPatientID, FacilityID: otherFacilityID}}
	s.codes[codeID] = visit.ServiceCode{ID: codeID}
	s.categories[categoryID] = visit.Category{ID: categoryID}
	s.types[normalTypeID] = schedule.Type{ID: normalTypeID, Name: schedule.Normal}
	s.types[visitTypeID] = schedule.Type{ID: visitTypeID, Name: schedule.Visit}
	s.recurring[recurringID] = schedule.RecurringDetail{RecurringSchedule: schedule.RecurringSchedule{
		ID:   recurringID,
		Slot: schedule.Slot{FacilityID: facilityID, StaffID: staffID, Date: civil.Date{Year: 2026, Month: 10, Day: 5}},
		Rule: schedule.Rule{Frequency: schedule.Weekly},
	}}
	return s
}

// editorCtx は、事業所の全ての予定を編集できる職員を持つ ctx を返す。権限の判定のほかのテストに使う。
func editorCtx() context.Context {
	return auth.WithPrincipal(context.Background(), auth.Principal{Staff: staff.Detail{
		Summary:  staff.Summary{Staff: staff.Staff{ID: "EDITOR", FacilityID: facilityID}},
		Policies: []staff.PolicyGrant{{PolicyCode: organization.ScheduleAllEdit}},
	}})
}

func newSchedules(s *store) (*usecase.Schedules, *fakeTx) {
	tx := &fakeTx{}
	return usecase.NewSchedules(usecase.ScheduleRepositories{
		Facilities: facilities{s},
		Staff:      staffRepo{s},
		Patients:   patients{s},
		Visits:     visits{s},
		Schedules:  schedules{s},
	}, tx, &seqIDs{}), tx
}

func normalSlot() usecase.SlotInput {
	return usecase.SlotInput{
		TypeID:    normalTypeID,
		Date:      civil.Date{Year: 2026, Month: 10, Day: 20},
		StartTime: civil.Time{Hour: 17, Minute: 30},
		EndTime:   civil.Time{Hour: 18},
		StaffID:   staffID,
		Title:     ptr("カンファレンス"),
	}
}

func visitSlot(v usecase.VisitInput) usecase.SlotInput {
	in := normalSlot()
	in.TypeID = visitTypeID
	in.Title = nil
	in.Visit = &v
	return in
}

func validVisit() usecase.VisitInput {
	return usecase.VisitInput{
		PatientID: patientID, AssignedStaffID: staffID, CompanionID: ptr(companionID),
		ServiceCodeID: codeID, CategoryIDs: []string{categoryID},
	}
}

func TestSchedulesCreate(t *testing.T) {
	tests := []struct {
		name       string
		facilityID string
		in         func() usecase.SlotInput
		wantErr    error
		wantInfos  int
	}{
		{name: "通常の予定", facilityID: facilityID, in: normalSlot},
		{name: "訪問の予定", facilityID: facilityID, in: func() usecase.SlotInput { return visitSlot(validVisit()) }, wantInfos: 1},
		{name: "事業所がない", facilityID: "MISSING", in: normalSlot, wantErr: domain.ErrNotFound},
		{name: "予定の種類がない", facilityID: facilityID, in: func() usecase.SlotInput {
			in := normalSlot()
			in.TypeID = "MISSING"
			return in
		}, wantErr: domain.ErrInvalidInput},
		{name: "別の事業所の職員", facilityID: facilityID, in: func() usecase.SlotInput {
			in := normalSlot()
			in.StaffID = otherStaffID
			return in
		}, wantErr: domain.ErrInvalidInput},
		{name: "通常の予定に訪問の情報", facilityID: facilityID, in: func() usecase.SlotInput {
			in := normalSlot()
			v := validVisit()
			in.Visit = &v
			return in
		}, wantErr: domain.ErrInvalidInput},
		{name: "別の事業所の利用者", facilityID: facilityID, in: func() usecase.SlotInput {
			v := validVisit()
			v.PatientID = otherPatientID
			return visitSlot(v)
		}, wantErr: domain.ErrInvalidInput},
		{name: "別の事業所の同行者", facilityID: facilityID, in: func() usecase.SlotInput {
			v := validVisit()
			v.CompanionID = ptr(otherStaffID)
			return visitSlot(v)
		}, wantErr: domain.ErrInvalidInput},
		{name: "訪問の区分がない", facilityID: facilityID, in: func() usecase.SlotInput {
			v := validVisit()
			v.CategoryIDs = []string{"MISSING"}
			return visitSlot(v)
		}, wantErr: domain.ErrInvalidInput},
		{name: "サービスコードがない", facilityID: facilityID, in: func() usecase.SlotInput {
			v := validVisit()
			v.ServiceCodeID = "MISSING"
			return visitSlot(v)
		}, wantErr: domain.ErrInvalidInput},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := seeded()
			uc, tx := newSchedules(s)
			got, err := uc.Create(editorCtx(), tt.facilityID, tt.in())
			if tt.wantErr != nil {
				if !errors.Is(err, tt.wantErr) {
					t.Fatalf("err = %v, want %v", err, tt.wantErr)
				}
				if len(s.schedules) != 0 {
					t.Errorf("予定が %d 件保存された", len(s.schedules))
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			if tx.calls != 1 {
				t.Errorf("トランザクションの回数 = %d", tx.calls)
			}
			if got.FacilityID != facilityID || got.StaffID != staffID {
				t.Errorf("got %+v", got.Schedule)
			}
			if !got.IsOverTimeWork {
				t.Error("17 時 30 分に始まる予定が時間外にならない")
			}
			if len(s.infos) != tt.wantInfos {
				t.Errorf("訪問の情報 = %d 件, want %d", len(s.infos), tt.wantInfos)
			}
			if tt.wantInfos > 0 && (got.VisitInfoID == nil || s.infos[*got.VisitInfoID].PatientID != patientID) {
				t.Errorf("VisitInfoID = %v", got.VisitInfoID)
			}
		})
	}
}

func TestSchedulesCreateRecurring(t *testing.T) {
	s := seeded()
	uc, _ := newSchedules(s)
	got, err := uc.CreateRecurring(editorCtx(), facilityID, normalSlot(),
		usecase.RuleInput{Frequency: schedule.Weekly, DayOfWeek: ptr(2)})
	if err != nil {
		t.Fatal(err)
	}
	if got.Rule.Frequency != schedule.Weekly || got.Rule.ID == "" {
		t.Errorf("Rule = %+v", got.Rule)
	}

	_, err = uc.CreateRecurring(editorCtx(), facilityID, normalSlot(),
		usecase.RuleInput{Frequency: schedule.Monthly, DayOfWeek: ptr(2)})
	if !errors.Is(err, domain.ErrInvalidInput) {
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
	}{
		{name: "回を置き換える", recurringID: recurringID, date: monday},
		{name: "同じ回を 2 度置き換える", recurringID: recurringID, date: monday, repeat: true, wantErr: domain.ErrConflict},
		{name: "回に当たらない日", recurringID: recurringID, date: civil.Date{Year: 2026, Month: 10, Day: 13}, wantErr: domain.ErrInvalidInput},
		{name: "繰り返しの予定がない", recurringID: "MISSING", date: monday, wantErr: domain.ErrNotFound},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := seeded()
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
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			if got.RecurringScheduleID == nil || *got.RecurringScheduleID != recurringID {
				t.Errorf("RecurringScheduleID = %v", got.RecurringScheduleID)
			}
			if ex := s.recurring[recurringID].ExclusionDates; len(ex) != 1 || ex[0] != tt.date {
				t.Errorf("ExclusionDates = %v", ex)
			}
		})
	}
}

func TestSchedulesCancel(t *testing.T) {
	s := seeded()
	uc, _ := newSchedules(s)
	ctx := editorCtx()
	created, err := uc.Create(ctx, facilityID, normalSlot())
	if err != nil {
		t.Fatal(err)
	}
	if _, err := uc.Cancel(ctx, "MISSING", "体調不良"); !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("err = %v, want ErrNotFound", err)
	}
	if _, err := uc.Cancel(ctx, created.ID, ""); !errors.Is(err, domain.ErrInvalidInput) {
		t.Fatalf("err = %v, want ErrInvalidInput", err)
	}
	if _, err := uc.Cancel(ctx, created.ID, "体調不良"); err != nil {
		t.Fatal(err)
	}
	if _, err := uc.Cancel(ctx, created.ID, "体調不良"); !errors.Is(err, domain.ErrConflict) {
		t.Fatalf("err = %v, want ErrConflict", err)
	}
}

func TestSchedulesUpdate(t *testing.T) {
	tests := []struct {
		name      string
		in        func() usecase.SlotInput
		cancel    bool
		missing   bool
		single    bool
		wantErr   error
		wantInfos int
	}{
		{name: "訪問の予定を通常の予定にすると訪問の情報を消す", in: normalSlot},
		{name: "訪問の情報を作り直す", in: func() usecase.SlotInput { return visitSlot(validVisit()) }, wantInfos: 1},
		{name: "繰り返しに属さない予定", in: normalSlot, single: true},
		{name: "キャンセル済み", in: normalSlot, cancel: true, wantErr: domain.ErrConflict, wantInfos: 1},
		{name: "予定がない", in: normalSlot, missing: true, wantErr: domain.ErrNotFound, wantInfos: 1},
		{name: "別の事業所の職員", in: func() usecase.SlotInput {
			in := normalSlot()
			in.StaffID = otherStaffID
			return in
		}, wantErr: domain.ErrInvalidInput, wantInfos: 1},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := seeded()
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
			calls := tx.calls
			got, err := uc.Update(ctx, id, tt.in())
			if len(s.infos) != tt.wantInfos {
				t.Errorf("訪問の情報 = %d 件, want %d", len(s.infos), tt.wantInfos)
			}
			if tt.wantErr != nil {
				if !errors.Is(err, tt.wantErr) {
					t.Fatalf("err = %v, want %v", err, tt.wantErr)
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			if tx.calls != calls+1 {
				t.Errorf("トランザクションの回数 = %d", tx.calls-calls)
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
	s := seeded()
	uc, _ := newSchedules(s)
	ctx := editorCtx()
	from, to := civil.Date{Year: 2026, Month: 10, Day: 20}, civil.Date{Year: 2026, Month: 10, Day: 1}
	if _, err := uc.List(ctx, facilityID, schedule.ListQuery{DateFrom: &from, DateTo: &to}); !errors.Is(err, domain.ErrInvalidInput) {
		t.Fatalf("err = %v, want ErrInvalidInput", err)
	}
	if _, err := uc.List(ctx, "MISSING", schedule.ListQuery{}); !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("err = %v, want ErrNotFound", err)
	}
}

func TestStaffCreate(t *testing.T) {
	const depID, teamID, posID, otherDepID = "DEP", "TEAM", "POS", "OTHERDEP"
	setup := func() *store {
		s := seeded()
		s.departments[depID] = organization.Department{ID: depID, FacilityID: facilityID}
		s.departments[otherDepID] = organization.Department{ID: otherDepID, FacilityID: otherFacilityID}
		s.teams[teamID] = organization.Team{ID: teamID, FacilityID: facilityID}
		s.positions[posID] = organization.Position{ID: posID, FacilityID: facilityID,
			Policies: []organization.Policy{
				{ID: "P1", Code: organization.ScheduleSelfEdit},
				{ID: "P2", Code: organization.ScheduleTeamRead, NeedsTarget: true},
			}}
		return s
	}
	newUC := func(s *store) *usecase.Staff {
		return usecase.NewStaff(usecase.StaffRepositories{
			Facilities: facilities{s}, Departments: departments{s}, Teams: teams{s},
			Positions: positions{s}, Staff: staffRepo{s},
		}, &fakeTx{}, &seqIDs{})
	}
	in := usecase.CreateStaffInput{
		FacilityID: facilityID, Username: "森 健太", Email: "kenta.mori@example.com",
		DepartmentID: depID, TeamID: teamID, PositionID: posID,
	}

	s := setup()
	got, err := newUC(s).Create(context.Background(), in)
	if err != nil {
		t.Fatal(err)
	}
	g := s.grants[got.ID]
	if len(g) != 2 || g[0].PolicyID != "P1" || g[1].PolicyID != "P2" {
		t.Fatalf("grants = %+v", g)
	}
	if len(g[0].Targets) != 0 {
		t.Errorf("自分の予定の編集の対象 = %+v, want なし", g[0].Targets)
	}
	if ts := g[1].Targets; len(ts) != 1 || ts[0].TeamID != teamID || ts[0].UserID != "" || ts[0].ID == "" {
		t.Errorf("チームの閲覧の対象 = %+v, want 所属のチーム %s", ts, teamID)
	}

	other := in
	other.DepartmentID = otherDepID
	if _, err := newUC(setup()).Create(context.Background(), other); !errors.Is(err, domain.ErrInvalidInput) {
		t.Fatalf("err = %v, want ErrInvalidInput", err)
	}
}

func TestStaffChangePosition(t *testing.T) {
	const teamID, leaderID, otherPosID = "TEAM", "LEADER", "OTHERPOS"
	setup := func() *store {
		s := seeded()
		d := s.staff[staffID]
		d.TeamID = teamID
		d.PositionID = "MEMBER"
		d.Policies = []staff.PolicyGrant{{UserPolicyID: "OLD", PolicyCode: organization.ScheduleUserRead, TargetUserIDs: []string{companionID}}}
		s.staff[staffID] = d
		s.positions[leaderID] = organization.Position{ID: leaderID, FacilityID: facilityID, Policies: []organization.Policy{
			{ID: "SELF", Code: organization.ScheduleSelfEdit},
			{ID: "TEAMEDIT", Code: organization.ScheduleTeamEdit, NeedsTarget: true},
		}}
		s.positions[otherPosID] = organization.Position{ID: otherPosID, FacilityID: otherFacilityID}
		return s
	}
	newUC := func(s *store) *usecase.Staff {
		return usecase.NewStaff(usecase.StaffRepositories{
			Facilities: facilities{s}, Departments: departments{s}, Teams: teams{s},
			Positions: positions{s}, Staff: staffRepo{s},
		}, &fakeTx{}, &seqIDs{})
	}
	ctx := context.Background()

	s := setup()
	got, err := newUC(s).ChangePosition(ctx, staffID, leaderID)
	if err != nil {
		t.Fatal(err)
	}
	if got.PositionID != leaderID {
		t.Errorf("PositionID = %s", got.PositionID)
	}
	g := s.grants[staffID]
	if len(g) != 2 || g[0].PolicyID != "SELF" || g[1].PolicyID != "TEAMEDIT" {
		t.Fatalf("grants = %+v, want 新しい役職の既定だけ", g)
	}
	if ts := g[1].Targets; len(ts) != 1 || ts[0].TeamID != teamID {
		t.Errorf("チームの編集の対象 = %+v, want 所属のチーム", ts)
	}

	if _, err := newUC(setup()).ChangePosition(ctx, staffID, otherPosID); !errors.Is(err, domain.ErrInvalidInput) {
		t.Errorf("別の事業所の役職: err = %v, want ErrInvalidInput", err)
	}
	if _, err := newUC(setup()).ChangePosition(ctx, staffID, "MISSING"); !errors.Is(err, domain.ErrInvalidInput) {
		t.Errorf("無い役職: err = %v, want ErrInvalidInput", err)
	}
	if _, err := newUC(setup()).ChangePosition(ctx, "MISSING", leaderID); !errors.Is(err, domain.ErrNotFound) {
		t.Errorf("無い職員: err = %v, want ErrNotFound", err)
	}
}

func TestOrganizationCreatePosition(t *testing.T) {
	s := seeded()
	s.policies["P1"] = organization.Policy{ID: "P1"}
	uc := usecase.NewOrganization(usecase.OrganizationRepositories{
		Facilities: facilities{s}, Positions: positions{s}, Policies: policies{s},
	}, &fakeTx{}, &seqIDs{})
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
