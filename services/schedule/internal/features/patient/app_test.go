package patient_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/patient"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/staff"
	"github.com/Fukuemon/buddy/services/schedule/internal/inmem"
)

// today は、newApp の App の今日（2026-10-31）である。
var today = civil.Date{Year: 2026, Month: 10, Day: 31}

func newApp(s *inmem.Store, guard organization.Guard) *patient.App {
	return patient.NewApp(patient.Deps{
		Facilities: inmem.Facilities{Store: s}, Staff: inmem.StaffRefs{Store: s}, ServiceCodes: inmem.VisitMasters{Store: s}, Patients: inmem.Patients{Store: s},
		Schedules: inmem.PatientSchedules{Store: s}, Locks: inmem.Staff{Store: s},
		Now: func() time.Time { return today.Time().Add(9 * time.Hour) },
	}, &inmem.Tx{}, &inmem.SeqIDs{}, guard)
}

func allow(context.Context) error { return nil }

func deny(context.Context) error { return apperr.ErrForbidden }

// nonVisiting は、stopStaff に渡して、職員を訪問しない職員にする。職員の状態ではない（ADR-0022）。
const nonVisiting staff.Status = "non_visiting"

// stopStaff は、職員 id を休職か退職か、訪問しない職員にする。
func stopStaff(t *testing.T, s *inmem.Store, id string, status staff.Status) {
	t.Helper()
	st := inmem.Staff{Store: s}
	var err error
	switch status {
	case nonVisiting:
		d := s.Staff[id]
		d.NonVisiting = true
		s.Staff[id] = d
	case staff.StatusRetired:
		err = st.Retire(context.Background(), id)
	default:
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

// 職員の管理の権限が無い職員は、利用者の変更、利用の終了、利用の再開ができない（#346 の検証の観点 5）。
func TestPatientGuard(t *testing.T) {
	ctx := context.Background()
	s := inmem.Seeded()
	before := s.Patients[inmem.PatientID]
	uc := newApp(s, deny)
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
