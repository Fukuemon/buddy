package usecase_test

import (
	"context"
	"errors"
	"testing"

	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain/auth"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/usecase"
)

const (
	orgID      = "org-a"
	otherOrgID = "org-b"
	email      = "hina.aoki@example.com"
)

func authStore() *store {
	s := seeded()
	s.facilityByOrg[orgID] = facilityID
	s.facilityByOrg[otherOrgID] = otherFacilityID
	d := s.staff[staffID]
	d.Email = email
	s.staff[staffID] = d
	return s
}

func newAuth(s *store) *usecase.Auth {
	return usecase.NewAuth(usecase.AuthRepositories{Facilities: facilities{s}, Staff: staffRepo{s}})
}

func TestAuthenticateLinksSubByVerifiedEmail(t *testing.T) {
	s := authStore()
	a := newAuth(s)
	id := auth.Identity{Subject: "sub-1", Email: email, EmailVerified: true, OrgID: orgID}
	p, err := a.Authenticate(context.Background(), id)
	if err != nil {
		t.Fatal(err)
	}
	if p.Staff.ID != staffID || s.staff[staffID].Sub == nil || *s.staff[staffID].Sub != "sub-1" {
		t.Fatalf("principal = %+v, sub = %v", p, s.staff[staffID].Sub)
	}

	p, err = a.Authenticate(context.Background(), auth.Identity{Subject: "sub-1", OrgID: orgID})
	if err != nil || p.Staff.ID != staffID {
		t.Fatalf("結び付けた後に、メールのないトークンの sub で引けない: principal = %+v, err = %v", p, err)
	}
}

func TestAuthenticateForbidden(t *testing.T) {
	linked := func(s *store) {
		d := s.staff[staffID]
		d.Sub = ptr("sub-linked")
		s.staff[staffID] = d
	}
	tests := []struct {
		name  string
		edit  func(*store)
		id    auth.Identity
		check func(t *testing.T, s *store)
	}{
		{name: "組織のクレームがない", id: auth.Identity{Subject: "sub-1", Email: email, EmailVerified: true}},
		{name: "組織が事業所に結び付いていない", id: auth.Identity{Subject: "sub-1", Email: email, EmailVerified: true, OrgID: "org-x"}},
		{name: "メールが未確認", id: auth.Identity{Subject: "sub-1", Email: email, OrgID: orgID},
			check: func(t *testing.T, s *store) {
				if s.staff[staffID].Sub != nil {
					t.Error("未確認のメールで sub を結び付けた")
				}
			}},
		{name: "メールの職員がいない", id: auth.Identity{Subject: "sub-1", Email: "nobody@example.com", EmailVerified: true, OrgID: orgID}},
		{name: "ほかの組織の事業所の職員のメール", id: auth.Identity{Subject: "sub-1", Email: email, EmailVerified: true, OrgID: otherOrgID},
			check: func(t *testing.T, s *store) {
				if s.staff[staffID].Sub != nil {
					t.Error("ほかの事業所の職員に sub を結び付けた")
				}
			}},
		{name: "結び付け済みの職員に別の sub", edit: linked,
			id: auth.Identity{Subject: "sub-2", Email: email, EmailVerified: true, OrgID: orgID},
			check: func(t *testing.T, s *store) {
				if *s.staff[staffID].Sub != "sub-linked" {
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
