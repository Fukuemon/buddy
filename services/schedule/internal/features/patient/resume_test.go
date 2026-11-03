package patient_test

import (
	"context"
	"errors"
	"testing"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/staff"
	"github.com/Fukuemon/buddy/services/schedule/internal/inmem"
)

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
