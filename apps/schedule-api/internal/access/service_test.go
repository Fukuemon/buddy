package access_test

import (
	"context"
	"errors"
	"testing"

	"github.com/Fukuemon/buddy/apps/schedule-api/internal/access"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/auth"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/inmem"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/organization"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/schedule"
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
)

func ptr[T any](v T) *T { return &v }

func authStore() *inmem.Store {
	s := inmem.Seeded()
	s.FacilityByOrg[orgID] = facilityID
	s.FacilityByOrg[otherOrgID] = otherFacilityID
	d := s.Staff[staffID]
	d.Email = email
	s.Staff[staffID] = d
	return s
}

func newAuth(s *inmem.Store) *access.Service {
	return access.NewService(access.Repositories{
		Facilities: inmem.Facilities{Store: s}, Departments: inmem.Departments{Store: s}, Teams: inmem.Teams{Store: s}, Positions: inmem.Positions{Store: s},
		Staff: inmem.Staff{Store: s}, Schedules: inmem.Schedules{Store: s},
	})
}

func TestAuthenticateLinksSubByVerifiedEmail(t *testing.T) {
	s := authStore()
	a := newAuth(s)
	id := auth.Identity{Subject: "sub-1", Email: email, EmailVerified: true, OrgID: orgID}
	p, err := a.Authenticate(context.Background(), id)
	if err != nil {
		t.Fatal(err)
	}
	if p.Staff.ID != staffID || s.Staff[staffID].Sub == nil || *s.Staff[staffID].Sub != "sub-1" {
		t.Fatalf("principal = %+v, sub = %v", p, s.Staff[staffID].Sub)
	}

	p, err = a.Authenticate(context.Background(), auth.Identity{Subject: "sub-1", OrgID: orgID})
	if err != nil || p.Staff.ID != staffID {
		t.Fatalf("結び付けた後に、メールのないトークンの sub で引けない: principal = %+v, err = %v", p, err)
	}
}

func TestAuthenticateForbidden(t *testing.T) {
	linked := func(s *inmem.Store) {
		d := s.Staff[staffID]
		d.Sub = ptr("sub-linked")
		s.Staff[staffID] = d
	}
	tests := []struct {
		name  string
		edit  func(*inmem.Store)
		id    auth.Identity
		check func(t *testing.T, s *inmem.Store)
	}{
		{name: "組織のクレームがない", id: auth.Identity{Subject: "sub-1", Email: email, EmailVerified: true}},
		{name: "組織が事業所に結び付いていない", id: auth.Identity{Subject: "sub-1", Email: email, EmailVerified: true, OrgID: "org-x"}},
		{name: "メールが未確認", id: auth.Identity{Subject: "sub-1", Email: email, OrgID: orgID},
			check: func(t *testing.T, s *inmem.Store) {
				if s.Staff[staffID].Sub != nil {
					t.Error("未確認のメールで sub を結び付けた")
				}
			}},
		{name: "メールの職員がいない", id: auth.Identity{Subject: "sub-1", Email: "nobody@example.com", EmailVerified: true, OrgID: orgID}},
		{name: "ほかの組織の事業所の職員のメール", id: auth.Identity{Subject: "sub-1", Email: email, EmailVerified: true, OrgID: otherOrgID},
			check: func(t *testing.T, s *inmem.Store) {
				if s.Staff[staffID].Sub != nil {
					t.Error("ほかの事業所の職員に sub を結び付けた")
				}
			}},
		{name: "結び付け済みの職員に別の sub", edit: linked,
			id: auth.Identity{Subject: "sub-2", Email: email, EmailVerified: true, OrgID: orgID},
			check: func(t *testing.T, s *inmem.Store) {
				if *s.Staff[staffID].Sub != "sub-linked" {
					t.Error("結び付け済みの sub を書き換えた")
				}
			}},
		{name: "sub の職員がほかの組織の事業所", edit: linked, id: auth.Identity{Subject: "sub-linked", OrgID: otherOrgID}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := authStore()
			if tt.edit != nil {
				tt.edit(s)
			}
			_, err := newAuth(s).Authenticate(context.Background(), tt.id)
			if !errors.Is(err, domain.ErrForbidden) {
				t.Fatalf("err = %v, want ErrForbidden", err)
			}
			if tt.check != nil {
				tt.check(t, s)
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
	}
	for _, tt := range tests {
		got, err := a.FacilityOf(context.Background(), tt.r, tt.id)
		if err != nil || got != tt.want {
			t.Errorf("FacilityOf(%d, %s) = %q, %v, want %q", tt.r, tt.id, got, err, tt.want)
		}
	}
	if _, err := a.FacilityOf(context.Background(), access.ResourceSchedule, "NONE"); !errors.Is(err, domain.ErrNotFound) {
		t.Errorf("err = %v, want ErrNotFound", err)
	}
}
