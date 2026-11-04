package postgres

import (
	"context"
	"errors"
	"testing"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
)

type facilityReader interface {
	FacilityOf(ctx context.Context, id string) (string, error)
}

func TestFacilityOfMatchesGet(t *testing.T) {
	ctx := context.Background()
	facilityOfGet := func(get func() (string, error)) string {
		t.Helper()
		f, err := get()
		if err != nil {
			t.Fatal(err)
		}
		return f
	}
	tests := []struct {
		name   string
		reader facilityReader
		id     string
		want   string
	}{
		{name: "部署", reader: NewDepartmentRepository(testDB), id: seedDepartment, want: facilityOfGet(func() (string, error) {
			d, err := NewDepartmentRepository(testDB).Get(ctx, seedDepartment)
			return d.FacilityID, err
		})},
		{name: "チーム", reader: NewTeamRepository(testDB), id: seedTeam, want: facilityOfGet(func() (string, error) {
			d, err := NewTeamRepository(testDB).Get(ctx, seedTeam)
			return d.FacilityID, err
		})},
		{name: "役職", reader: NewPositionRepository(testDB), id: seedLeader, want: facilityOfGet(func() (string, error) {
			d, err := NewPositionRepository(testDB).Get(ctx, seedLeader)
			return d.FacilityID, err
		})},
		{name: "職員", reader: NewStaffRefRepository(testDB), id: seedMori, want: facilityOfGet(func() (string, error) {
			d, err := NewStaffRefRepository(testDB).Get(ctx, seedMori)
			return d.FacilityID, err
		})},
		{name: "利用者", reader: NewPatientRepository(testDB), id: seedPatient, want: facilityOfGet(func() (string, error) {
			d, err := NewPatientRepository(testDB).Get(ctx, seedPatient)
			return d.FacilityID, err
		})},
		{name: "予定", reader: NewScheduleRepository(testDB), id: seedVisitSchedule, want: facilityOfGet(func() (string, error) {
			d, err := NewScheduleRepository(testDB).Get(ctx, seedVisitSchedule)
			return d.FacilityID, err
		})},
		{name: "繰り返しの予定", reader: NewRecurringScheduleRepository(testDB), id: seedRecurring, want: facilityOfGet(func() (string, error) {
			d, err := NewRecurringScheduleRepository(testDB).Get(ctx, seedRecurring)
			return d.FacilityID, err
		})},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := tt.reader.FacilityOf(ctx, tt.id)
			if err != nil || got != tt.want || got != seedFacility {
				t.Errorf("FacilityOf(%s) = %q, %v, want %q", tt.id, got, err, tt.want)
			}
		})
	}
}

func TestFacilityOfNotFound(t *testing.T) {
	readers := map[string]facilityReader{
		"部署": NewDepartmentRepository(testDB), "チーム": NewTeamRepository(testDB), "役職": NewPositionRepository(testDB),
		"職員": NewStaffRefRepository(testDB), "利用者": NewPatientRepository(testDB), "予定": NewScheduleRepository(testDB),
		"繰り返しの予定": NewRecurringScheduleRepository(testDB), "外部のカレンダー": NewCalendarRepository(testDB),
		"書き出しの待ち": NewCalendarExportRepository(testDB),
	}
	for name, r := range readers {
		t.Run(name, func(t *testing.T) {
			if _, err := r.FacilityOf(context.Background(), "01M3TD0000000000000000NONE"); !errors.Is(err, apperr.ErrNotFound) {
				t.Errorf("err = %v, want ErrNotFound", err)
			}
		})
	}
}

func TestGetPrincipal(t *testing.T) {
	ctx := context.Background()
	r := NewStaffRepository(testDB)
	d, err := r.Get(ctx, seedMori)
	if err != nil {
		t.Fatal(err)
	}
	p, err := r.GetPrincipal(ctx, seedMori)
	if err != nil || p.ID != d.ID || p.FacilityID != d.FacilityID || p.TeamID != d.TeamID || p.Status != d.Status() || len(p.Policies) != len(d.Policies) {
		t.Errorf("GetPrincipal = %+v, %v, want 職員の詳細 %+v の項目", p, err, d)
	}
	if _, err := r.GetPrincipal(ctx, "01M3TD0000000000000000NONE"); !errors.Is(err, apperr.ErrNotFound) {
		t.Errorf("err = %v, want ErrNotFound", err)
	}
	f := NewFacilityRepository(testDB)
	byOrg, err := f.GetByOrgID(ctx, "org-sample")
	if err != nil {
		t.Fatal(err)
	}
	if id, err := f.GetIDByOrgID(ctx, "org-sample"); err != nil || id != byOrg.ID {
		t.Errorf("GetIDByOrgID = %q, %v, want %q", id, err, byOrg.ID)
	}
}
