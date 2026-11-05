package patient_test

import (
	"context"
	"errors"
	"reflect"
	"testing"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/patient"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/schedule"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/scheduleview"
	"github.com/Fukuemon/buddy/services/schedule/internal/inmem"
)

// visitSchedule は、利用者 patientID の date の訪問の予定を s に入れる。
func visitSchedule(s *inmem.Store, id, patientID string, date civil.Date) {
	infoID := "INFO" + id
	s.PutVisitInfo(infoID, patientID)
	s.Schedules[id] = scheduleview.Detail{Schedule: schedule.Schedule{ID: id, Slot: schedule.Slot{
		FacilityID: inmem.FacilityID, StaffID: inmem.StaffID, Date: date, StartTime: civil.Time{Hour: 9}, EndTime: civil.Time{Hour: 10}, VisitInfoID: &infoID,
	}}}
}

// 今日以降の予定か繰り返しの予定が残る利用者は、利用の終了にできず、残る一覧を返す。過去の予定とキャンセルした予定は数えない（ADR-0019）。
func TestPatientEndRejectsRemainingSchedules(t *testing.T) {
	ctx := context.Background()
	s := inmem.Seeded()
	visitSchedule(s, "PAST", inmem.PatientID, civil.Date{Year: 2026, Month: 10, Day: 30})
	visitSchedule(s, "CANCELLED", inmem.PatientID, today)
	s.Cancels["CANCELLED"] = schedule.Cancellation{ID: "C", ScheduleID: "CANCELLED"}
	visitSchedule(s, "OTHER", "ANOTHER", today)
	visitSchedule(s, "TODAY", inmem.PatientID, today)
	recInfo := "INFOREC"
	s.PutVisitInfo(recInfo, inmem.PatientID)
	s.Recurring["REC"] = scheduleview.RecurringDetail{RecurringSchedule: schedule.RecurringSchedule{
		ID: "REC", Slot: schedule.Slot{FacilityID: inmem.FacilityID, StaffID: inmem.StaffID, Date: civil.Date{Year: 2026, Month: 9, Day: 1}, VisitInfoID: &recInfo},
		Rule: schedule.Rule{Frequency: schedule.Weekly},
	}}
	uc := newApp(s, allow)
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
	if len(se.Remaining.Schedules) != 1 || se.Remaining.Schedules[0].ID != "TODAY" || len(se.Remaining.RecurringSchedules) != 1 || se.Remaining.RecurringSchedules[0].ID != "REC" {
		t.Errorf("remaining = %+v, want 今日の予定と繰り返しの予定", se.Remaining)
	}
	if s.Patients[inmem.PatientID].IsEnded() {
		t.Error("拒んだのに利用の終了になった")
	}

	end := civil.Date{Year: 2026, Month: 10, Day: 30}
	rs := s.Recurring["REC"]
	rs.Rule.EndDate = &end
	s.Recurring["REC"] = rs
	s.Cancels["TODAY"] = schedule.Cancellation{ID: "C2", ScheduleID: "TODAY"}
	got, err := uc.End(ctx, inmem.PatientID)
	if err != nil || !got.IsEnded() {
		t.Fatalf("予定をキャンセルし、繰り返しを終えた後: got = %+v, err = %v", got.Patient, err)
	}
}

// 利用の終了の利用者は、デフォルトの一覧に出ず、include_ended で出る。利用の終了にし直しても、最初の時刻を残す（#346 の検証の観点 3）。
func TestPatientEndAndList(t *testing.T) {
	ctx := context.Background()
	s := inmem.Seeded()
	uc := newApp(s, allow)
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
	if err != nil || len(listed) != 1 || !listed[0].IsEnded() {
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
