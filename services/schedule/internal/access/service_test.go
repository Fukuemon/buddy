package access_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/access"
	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/schedule"
	"github.com/Fukuemon/buddy/services/schedule/internal/inmem"
	"github.com/Fukuemon/buddy/services/schedule/internal/principal"
)

const (
	facilityID      = inmem.FacilityID
	otherFacilityID = inmem.OtherFacilityID
	staffID         = inmem.StaffID
	otherStaffID    = inmem.OtherStaffID
	recurringID     = inmem.RecurringID

	orgID      = "org-a"
	otherOrgID = "org-b"
	email      = "hina.aoki@example.com"
	sub        = "01JBRKRSTAFF00000000000000"
)

func ptr[T any](v T) *T { return &v }

// authStore は、職員 staffID に sub を入れた Store を返す。sub は、登録のときにブローカーが発行した職員の ID である。
func authStore() *inmem.Store {
	s := inmem.Seeded()
	s.FacilityByOrg[orgID] = facilityID
	s.FacilityByOrg[otherOrgID] = otherFacilityID
	d := s.Staff[staffID]
	d.Email = email
	d.Sub = ptr(sub)
	s.Staff[staffID] = d
	return s
}

func newAuth(s *inmem.Store) *access.Service {
	return access.NewService(access.Deps{
		Facilities: inmem.Facilities{Store: s}, Departments: inmem.Departments{Store: s}, Teams: inmem.Teams{Store: s}, Positions: inmem.Positions{Store: s},
		Staff: inmem.Staff{Store: s}, StaffRefs: inmem.StaffRefs{Store: s}, Patients: inmem.Patients{Store: s}, Schedules: inmem.Schedules{Store: s}, Recurring: inmem.RecurringSchedules{Store: s},
	})
}

func TestAuthenticateFindsStaffBySub(t *testing.T) {
	p, err := newAuth(authStore()).Authenticate(context.Background(), principal.Identity{Subject: sub, OrgID: orgID})
	if err != nil || p.Staff.ID != staffID {
		t.Fatalf("principal = %+v, err = %v, want %s", p, err, staffID)
	}
}

func TestAuthenticateForbidden(t *testing.T) {
	onLeave := func(s *inmem.Store) {
		d := s.Staff[staffID]
		d.LeaveStartedAt = ptr(time.Date(2026, 10, 23, 9, 0, 0, 0, time.UTC))
		s.Staff[staffID] = d
	}
	retired := func(s *inmem.Store) {
		d := s.Staff[staffID]
		d.RetiredAt = ptr(time.Date(2026, 10, 23, 9, 0, 0, 0, time.UTC))
		s.Staff[staffID] = d
	}
	tests := []struct {
		name string
		edit func(*inmem.Store)
		id   principal.Identity
	}{
		{name: "組織のクレームがない", id: principal.Identity{Subject: sub}},
		{name: "組織が事業所に結び付いていない", id: principal.Identity{Subject: sub, OrgID: "org-x"}},
		// 初回のログインの結び付けはしない。sub の職員がいなければ、メールで探さずに拒む
		{name: "sub の職員がいない", id: principal.Identity{Subject: "sub-unknown", OrgID: orgID}},
		{name: "sub の職員がほかの組織の事業所", id: principal.Identity{Subject: sub, OrgID: otherOrgID}},
		{name: "職員が休職している", edit: onLeave, id: principal.Identity{Subject: sub, OrgID: orgID}},
		{name: "職員が退職している", edit: retired, id: principal.Identity{Subject: sub, OrgID: orgID}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := authStore()
			if tt.edit != nil {
				tt.edit(s)
			}
			_, err := newAuth(s).Authenticate(context.Background(), tt.id)
			if !errors.Is(err, apperr.ErrForbidden) {
				t.Fatalf("err = %v, want ErrForbidden", err)
			}
		})
	}
}

func TestFacilityOf(t *testing.T) {
	s := authStore()
	s.Departments["DEP"] = organization.Department{ID: "DEP", FacilityID: otherFacilityID}
	s.Teams["TEAM"] = organization.Team{ID: "TEAM", FacilityID: facilityID}
	s.Positions["POS"] = organization.Position{ID: "POS", FacilityID: otherFacilityID}
	s.Schedules["SCH"] = schedule.Detail{Schedule: schedule.Schedule{ID: "SCH", Slot: schedule.Slot{FacilityID: otherFacilityID}}}
	a := newAuth(s)
	tests := []struct {
		r    access.Resource
		id   string
		want string
	}{
		{r: access.ResourceFacility, id: otherFacilityID, want: otherFacilityID},
		{r: access.ResourceDepartment, id: "DEP", want: otherFacilityID},
		{r: access.ResourceTeam, id: "TEAM", want: facilityID},
		{r: access.ResourcePosition, id: "POS", want: otherFacilityID},
		{r: access.ResourceStaff, id: otherStaffID, want: otherFacilityID},
		{r: access.ResourceSchedule, id: "SCH", want: otherFacilityID},
		{r: access.ResourceRecurringSchedule, id: recurringID, want: facilityID},
		{r: access.ResourcePatient, id: inmem.OtherPatientID, want: otherFacilityID},
	}
	for _, tt := range tests {
		got, err := a.FacilityOf(context.Background(), tt.r, tt.id)
		if err != nil || got != tt.want {
			t.Errorf("FacilityOf(%d, %s) = %q, %v, want %q", tt.r, tt.id, got, err, tt.want)
		}
	}
	if _, err := a.FacilityOf(context.Background(), access.ResourceSchedule, "NONE"); !errors.Is(err, apperr.ErrNotFound) {
		t.Errorf("err = %v, want ErrNotFound", err)
	}
}
