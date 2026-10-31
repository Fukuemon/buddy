package patient_test

import (
	"context"
	"errors"
	"reflect"
	"testing"
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/inmem"
	"github.com/Fukuemon/buddy/services/schedule/internal/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/patient"
	"github.com/Fukuemon/buddy/services/schedule/internal/schedule"
	"github.com/Fukuemon/buddy/services/schedule/internal/staff"
	"github.com/Fukuemon/buddy/services/schedule/internal/visit"
)

// today は、newUsecase の Usecase の今日（2026-10-31）である。
var today = civil.Date{Year: 2026, Month: 10, Day: 31}

func newUsecase(s *inmem.Store, guard organization.Guard) *patient.Usecase {
	return patient.NewUsecase(patient.Deps{
		Facilities: inmem.Facilities{Store: s}, Staff: inmem.StaffRefs{Store: s}, ServiceCodes: inmem.VisitMasters{Store: s}, Patients: inmem.Patients{Store: s},
		Schedules: inmem.PatientSchedules{Store: s}, Locks: inmem.Staff{Store: s},
		Now: func() time.Time { return today.Time().Add(9 * time.Hour) },
	}, &inmem.Tx{}, &inmem.SeqIDs{}, guard)
}

func allow(context.Context) error { return nil }

func deny(context.Context) error { return apperr.ErrForbidden }

func stopStaff(t *testing.T, s *inmem.Store, id string, status staff.Status) {
	t.Helper()
	st := inmem.Staff{Store: s}
	var err error
	if status == staff.StatusRetired {
		err = st.Retire(context.Background(), id)
	} else {
		err = st.StartLeave(context.Background(), id, nil)
	}
	if err != nil {
		t.Fatal(err)
	}
}

func updateInput(staffID string) patient.UpdateInput {
	return patient.UpdateInput{
		Name: "見本 花子", PreferredTime: patient.Afternoon, PreferredGender: patient.Female, ServiceCodeID: inmem.CodeID, AssignedStaffID: staffID,
	}
}

// 利用者の変更は、名前、サービス、希望、担当の職員を書き換える（#346 の検証の観点 1）。利用の終了の利用者も変えられ、利用の終了は残る。
func TestPatientUpdate(t *testing.T) {
	ctx := context.Background()
	for _, ended := range []bool{false, true} {
		s := inmem.Seeded()
		if ended {
			if err := (inmem.Patients{Store: s}).End(ctx, inmem.PatientID); err != nil {
				t.Fatal(err)
			}
		}
		got, err := newUsecase(s, allow).Update(ctx, inmem.PatientID, updateInput(inmem.CompanionID))
		if err != nil {
			t.Fatalf("ended = %v: %v", ended, err)
		}
		want := patient.Patient{
			ID: inmem.PatientID, FacilityID: inmem.FacilityID, Name: "見本 花子", PreferredTime: patient.Afternoon, PreferredGender: patient.Female,
			ServiceCodeID: inmem.CodeID, AssignedStaffID: inmem.CompanionID,
		}
		saved := s.Patients[inmem.PatientID].Patient
		if saved.Ended() != ended {
			t.Errorf("ended = %v: 利用の終了が変わった: %+v", ended, saved)
		}
		saved.EndedAt = nil
		if saved != want || got.Name != want.Name {
			t.Errorf("ended = %v: saved = %+v, want %+v", ended, saved, want)
		}
	}
}

// 担当を休職か退職の職員に変えると入力のエラーで拒む。今の担当のままなら、担当が休職か退職でも変えられる（#346 の検証の観点 2）。
func TestPatientUpdateAssignedStaff(t *testing.T) {
	ctx := context.Background()
	for _, status := range []staff.Status{staff.StatusOnLeave, staff.StatusRetired} {
		t.Run(string(status), func(t *testing.T) {
			s := inmem.Seeded()
			pa := s.Patients[inmem.PatientID]
			pa.AssignedStaffID = inmem.StaffID
			s.Patients[inmem.PatientID] = pa
			stopStaff(t, s, inmem.CompanionID, status)
			if _, err := newUsecase(s, allow).Update(ctx, inmem.PatientID, updateInput(inmem.CompanionID)); !errors.Is(err, apperr.ErrInvalidInput) {
				t.Fatalf("休職か退職の職員に変える: err = %v, want ErrInvalidInput", err)
			}
			if s.Patients[inmem.PatientID].AssignedStaffID != inmem.StaffID {
				t.Errorf("拒んだのに担当が変わった")
			}
			stopStaff(t, s, inmem.StaffID, status)
			if _, err := newUsecase(s, allow).Update(ctx, inmem.PatientID, updateInput(inmem.StaffID)); err != nil {
				t.Fatalf("今の担当のまま: err = %v", err)
			}
		})
	}
	s := inmem.Seeded()
	if _, err := newUsecase(s, allow).Update(ctx, inmem.PatientID, updateInput(inmem.OtherStaffID)); !errors.Is(err, apperr.ErrInvalidInput) {
		t.Errorf("別の事業所の職員: err = %v, want ErrInvalidInput", err)
	}
}

// 職員の管理の権限が無い職員は、利用者の変更、利用の終了、利用の再開ができない（#346 の検証の観点 5）。
func TestPatientGuard(t *testing.T) {
	ctx := context.Background()
	s := inmem.Seeded()
	before := s.Patients[inmem.PatientID]
	uc := newUsecase(s, deny)
	if _, err := uc.Update(ctx, inmem.PatientID, updateInput(inmem.StaffID)); !errors.Is(err, apperr.ErrForbidden) {
		t.Errorf("変更: err = %v, want ErrForbidden", err)
	}
	if _, err := uc.End(ctx, inmem.PatientID); !errors.Is(err, apperr.ErrForbidden) {
		t.Errorf("利用の終了: err = %v, want ErrForbidden", err)
	}
	if _, err := uc.Resume(ctx, inmem.PatientID, inmem.StaffID); !errors.Is(err, apperr.ErrForbidden) {
		t.Errorf("利用の再開: err = %v, want ErrForbidden", err)
	}
	if _, err := uc.Get(ctx, inmem.PatientID); !errors.Is(err, apperr.ErrForbidden) {
		t.Errorf("取得: err = %v, want ErrForbidden", err)
	}
	if _, err := uc.RemainingSchedules(ctx, inmem.PatientID); !errors.Is(err, apperr.ErrForbidden) {
		t.Errorf("残る予定: err = %v, want ErrForbidden", err)
	}
	if s.Patients[inmem.PatientID] != before {
		t.Errorf("拒んだのに利用者が変わった: %+v", s.Patients[inmem.PatientID])
	}
}

// visitSchedule は、利用者 patientID の date の訪問の予定を s に入れる。
func visitSchedule(s *inmem.Store, id, patientID string, date civil.Date) {
	infoID := "INFO" + id
	s.Infos[infoID] = visit.Info{ID: infoID, FacilityID: inmem.FacilityID, PatientID: patientID, AssignedStaffID: inmem.StaffID}
	s.Schedules[id] = schedule.Detail{Schedule: schedule.Schedule{ID: id, Slot: schedule.Slot{
		FacilityID: inmem.FacilityID, StaffID: inmem.StaffID, Date: date, StartTime: civil.Time{Hour: 9}, EndTime: civil.Time{Hour: 10}, VisitInfoID: &infoID,
	}}}
}

// 今日以降の予定か繰り返しの予定が残る利用者は、利用の終了にできず、残る一覧を返す。過去の予定とキャンセルした予定は数えない（ADR-0021）。
func TestPatientEndRejectsRemainingSchedules(t *testing.T) {
	ctx := context.Background()
	s := inmem.Seeded()
	visitSchedule(s, "PAST", inmem.PatientID, civil.Date{Year: 2026, Month: 10, Day: 30})
	visitSchedule(s, "CANCELLED", inmem.PatientID, today)
	s.Cancels["CANCELLED"] = schedule.Cancel{ID: "C", ScheduleID: "CANCELLED"}
	visitSchedule(s, "OTHER", "ANOTHER", today)
	visitSchedule(s, "TODAY", inmem.PatientID, today)
	recInfo := "INFOREC"
	s.Infos[recInfo] = visit.Info{ID: recInfo, FacilityID: inmem.FacilityID, PatientID: inmem.PatientID, AssignedStaffID: inmem.StaffID}
	s.Recurring["REC"] = schedule.RecurringDetail{RecurringSchedule: schedule.RecurringSchedule{
		ID: "REC", Slot: schedule.Slot{FacilityID: inmem.FacilityID, StaffID: inmem.StaffID, Date: civil.Date{Year: 2026, Month: 9, Day: 1}, VisitInfoID: &recInfo},
		Rule: schedule.Rule{Frequency: schedule.Weekly},
	}}
	uc := newUsecase(s, allow)
	read, err := uc.RemainingSchedules(ctx, inmem.PatientID)
	if err != nil {
		t.Fatal(err)
	}
	_, err = uc.End(ctx, inmem.PatientID)
	se, ok := errors.AsType[*patient.ScheduledError](err)
	if !ok || !errors.Is(err, apperr.ErrConflict) {
		t.Fatalf("err = %v, want *ScheduledError", err)
	}
	// 利用の終了の前に読む一覧は、利用の終了の 409 と同じ一覧になる（#353 の検証の観点 2）。
	if !reflect.DeepEqual(read, se.Remaining) {
		t.Errorf("RemainingSchedules = %+v, want 利用の終了の一覧 %+v", read, se.Remaining)
	}
	if len(se.Remaining.Schedules) != 1 || se.Remaining.Schedules[0].ID != "TODAY" || len(se.Remaining.Recurring) != 1 || se.Remaining.Recurring[0].ID != "REC" {
		t.Errorf("remaining = %+v, want 今日の予定と繰り返しの予定", se.Remaining)
	}
	if s.Patients[inmem.PatientID].Ended() {
		t.Error("拒んだのに利用の終了になった")
	}

	end := civil.Date{Year: 2026, Month: 10, Day: 30}
	rs := s.Recurring["REC"]
	rs.Rule.EndDate = &end
	s.Recurring["REC"] = rs
	s.Cancels["TODAY"] = schedule.Cancel{ID: "C2", ScheduleID: "TODAY"}
	got, err := uc.End(ctx, inmem.PatientID)
	if err != nil || !got.Ended() {
		t.Fatalf("予定をキャンセルし、繰り返しを終えた後: got = %+v, err = %v", got.Patient, err)
	}
}

// 利用の終了の利用者は、デフォルトの一覧に出ず、include_ended で出る。利用の終了にし直しても、最初の時刻を残す（#346 の検証の観点 3）。
func TestPatientEndAndList(t *testing.T) {
	ctx := context.Background()
	s := inmem.Seeded()
	uc := newUsecase(s, allow)
	first, err := uc.End(ctx, inmem.PatientID)
	if err != nil {
		t.Fatal(err)
	}
	again, err := uc.End(ctx, inmem.PatientID)
	if err != nil || !again.EndedAt.Equal(*first.EndedAt) {
		t.Fatalf("利用の終了にし直す: ended_at = %v, want %v, err = %v", again.EndedAt, first.EndedAt, err)
	}
	listed, err := uc.List(ctx, inmem.FacilityID, patient.ListQuery{})
	if err != nil || len(listed) != 0 {
		t.Errorf("デフォルトの一覧 = %+v, err = %v, want 空", listed, err)
	}
	listed, err = uc.List(ctx, inmem.FacilityID, patient.ListQuery{IncludeEnded: true})
	if err != nil || len(listed) != 1 || !listed[0].Ended() {
		t.Errorf("include_ended の一覧 = %+v, err = %v, want 利用の終了の利用者 1 人", listed, err)
	}
	if _, err := uc.End(ctx, "MISSING"); !errors.Is(err, apperr.ErrNotFound) {
		t.Errorf("いない利用者: err = %v, want ErrNotFound", err)
	}
	// 利用の終了の利用者も 1 人で読め、利用の終了にした時刻が返る（#353 の検証の観点 1）。
	got, err := uc.Get(ctx, inmem.PatientID)
	if err != nil || got.EndedAt == nil || !got.EndedAt.Equal(*first.EndedAt) {
		t.Errorf("取得 = %+v, err = %v, want 利用の終了にした時刻 %v", got.Patient, err, first.EndedAt)
	}
	if _, err := uc.Get(ctx, "MISSING"); !errors.Is(err, apperr.ErrNotFound) {
		t.Errorf("いない利用者の取得: err = %v, want ErrNotFound", err)
	}
	if _, err := uc.RemainingSchedules(ctx, "MISSING"); !errors.Is(err, apperr.ErrNotFound) {
		t.Errorf("いない利用者の残る予定: err = %v, want ErrNotFound", err)
	}
}

// 利用の再開は、担当の職員を書き換えて利用中に戻す。休職か退職の職員は入力のエラーで拒む（ADR-0021）。
func TestPatientResume(t *testing.T) {
	ctx := context.Background()
	for _, status := range []staff.Status{staff.StatusOnLeave, staff.StatusRetired} {
		t.Run(string(status), func(t *testing.T) {
			s := inmem.Seeded()
			uc := newUsecase(s, allow)
			if _, err := uc.End(ctx, inmem.PatientID); err != nil {
				t.Fatal(err)
			}
			stopStaff(t, s, inmem.StaffID, status)
			if _, err := uc.Resume(ctx, inmem.PatientID, inmem.StaffID); !errors.Is(err, apperr.ErrInvalidInput) {
				t.Fatalf("err = %v, want ErrInvalidInput", err)
			}
			if !s.Patients[inmem.PatientID].Ended() {
				t.Error("拒んだのに利用中に戻った")
			}
			got, err := uc.Resume(ctx, inmem.PatientID, inmem.CompanionID)
			if err != nil || got.Ended() || got.AssignedStaffID != inmem.CompanionID {
				t.Fatalf("有効な職員で再開: got = %+v, err = %v", got.Patient, err)
			}
		})
	}
}

// TestPatientCreateGuard は、職員の管理を許された職員だけが利用者を登録できることを確認する（ADR-0006）。
func TestPatientCreateGuard(t *testing.T) {
	ctx := context.Background()
	in := patient.CreateInput{
		FacilityID: inmem.FacilityID, Name: "見本 三郎", PreferredTime: patient.Morning, PreferredGender: patient.Male,
		ServiceCodeID: inmem.CodeID, AssignedStaffID: inmem.StaffID,
	}
	s := inmem.Seeded()
	got, err := newUsecase(s, func(context.Context) error { return nil }).Create(ctx, in)
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := s.Patients[got.ID]; !ok {
		t.Errorf("利用者が保存されていない: %+v", got)
	}

	s = inmem.Seeded()
	deny := func(context.Context) error { return apperr.ErrForbidden }
	if _, err := newUsecase(s, deny).Create(ctx, in); !errors.Is(err, apperr.ErrForbidden) {
		t.Fatalf("err = %v, want ErrForbidden", err)
	}
	if len(s.Patients) != 2 {
		t.Errorf("拒んだのに利用者が増えた: %d 人", len(s.Patients))
	}
}

// TestPatientCreateRejectsInactiveStaff は、休職か退職の職員を担当にした利用者を、入力のエラーで拒むことを確認する（#269 の検証の観点 4）。
func TestPatientCreateRejectsInactiveStaff(t *testing.T) {
	ctx := context.Background()
	in := patient.CreateInput{
		FacilityID: inmem.FacilityID, Name: "見本 三郎", PreferredTime: patient.Morning, PreferredGender: patient.Male,
		ServiceCodeID: inmem.CodeID, AssignedStaffID: inmem.StaffID,
	}
	allow := func(context.Context) error { return nil }
	for name, stop := range map[string]func(st inmem.Staff) error{
		"休職": func(st inmem.Staff) error { return st.StartLeave(ctx, inmem.StaffID, nil) },
		"退職": func(st inmem.Staff) error { return st.Retire(ctx, inmem.StaffID) },
	} {
		t.Run(name, func(t *testing.T) {
			s := inmem.Seeded()
			if err := stop(inmem.Staff{Store: s}); err != nil {
				t.Fatal(err)
			}
			before := len(s.Patients)
			if _, err := newUsecase(s, allow).Create(ctx, in); !errors.Is(err, apperr.ErrInvalidInput) {
				t.Fatalf("err = %v, want ErrInvalidInput", err)
			}
			if len(s.Patients) != before {
				t.Errorf("拒んだのに利用者が増えた: %d 人", len(s.Patients)-before)
			}
		})
	}
}
