package patient_test

import (
	"context"
	"errors"
	"testing"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/patient"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/staff"
	"github.com/Fukuemon/buddy/services/schedule/internal/inmem"
)

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
	for _, status := range []staff.Status{staff.StatusOnLeave, staff.StatusRetired, nonVisiting} {
		t.Run(string(status), func(t *testing.T) {
			s := inmem.Seeded()
			pa := s.Patients[inmem.PatientID]
			pa.AssignedStaffID = inmem.StaffID
			s.Patients[inmem.PatientID] = pa
			stopStaff(t, s, inmem.CompanionID, status)
			if _, err := newUsecase(s, allow).Update(ctx, inmem.PatientID, updateInput(inmem.CompanionID)); !errors.Is(err, apperr.ErrInvalidInput) {
				t.Fatalf("休職か退職か訪問しない職員に変える: err = %v, want ErrInvalidInput", err)
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
