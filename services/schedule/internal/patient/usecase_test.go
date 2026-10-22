package patient_test

import (
	"context"
	"errors"
	"testing"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/inmem"
	"github.com/Fukuemon/buddy/services/schedule/internal/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/patient"
)

func newUsecase(s *inmem.Store, guard organization.Guard) *patient.Usecase {
	return patient.NewUsecase(patient.Deps{
		Facilities: inmem.Facilities{Store: s}, Staff: inmem.StaffRefs{Store: s}, ServiceCodes: inmem.VisitMasters{Store: s}, Patients: inmem.Patients{Store: s},
	}, &inmem.SeqIDs{}, guard)
}

// TestPatientCreateGuard は、職員の管理を許された職員だけが利用者を登録できることを確かめる（ADR-0006）。
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
