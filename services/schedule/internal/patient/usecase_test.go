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
	}, &inmem.Tx{}, &inmem.SeqIDs{}, guard)
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
			if _, err := newUsecase(s, allow).Create(ctx, in); !errors.Is(err, apperr.ErrInvalidInput) {
				t.Fatalf("err = %v, want ErrInvalidInput", err)
			}
			if len(s.Patients) != 2 {
				t.Errorf("拒んだのに利用者が増えた: %d 人", len(s.Patients))
			}
		})
	}
}
