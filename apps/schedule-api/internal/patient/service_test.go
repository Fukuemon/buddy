package patient_test

import (
	"context"
	"errors"
	"testing"

	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/inmem"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/patient"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/staff"
)

func newService(s *inmem.Store, guard staff.Guard) *patient.Service {
	return patient.NewService(patient.Repositories{
		Facilities: inmem.Facilities{Store: s}, Staff: inmem.Staff{Store: s}, Visits: inmem.Visits{Store: s}, Patients: inmem.Patients{Store: s},
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
	got, err := newService(s, func(context.Context) error { return nil }).Create(ctx, in)
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := s.Patients[got.ID]; !ok {
		t.Errorf("利用者が保存されていない: %+v", got)
	}

	s = inmem.Seeded()
	deny := func(context.Context) error { return domain.ErrForbidden }
	if _, err := newService(s, deny).Create(ctx, in); !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("err = %v, want ErrForbidden", err)
	}
	if len(s.Patients) != 2 {
		t.Errorf("拒んだのに利用者が増えた: %d 人", len(s.Patients))
	}
}
