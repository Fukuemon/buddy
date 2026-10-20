package handler_test

import (
	"context"
	"io"
	"log"
	"log/slog"
	"net/http"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain/auth"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain/staff"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/infrastructure/oidc"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/infrastructure/oidc/oidctest"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/usecase"
)

const (
	testAudience    = "schedule-api"
	testOrgID       = "org-a"
	otherFacilityID = "01M3TCZZZZZZZZZZZZZZZZZZZY"
	otherScheduleID = "01M3TCZZZZZZZZZZZZZZZZZZZX"
)

var (
	testIssuer   *oidctest.Issuer
	testVerifier *oidc.Verifier
)

func TestMain(m *testing.M) {
	os.Exit(run(m))
}

func run(m *testing.M) int {
	var err error
	testIssuer, err = oidctest.Start()
	if err != nil {
		log.Print(err)
		return 1
	}
	defer testIssuer.Close()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	testVerifier, err = oidc.NewVerifier(ctx, oidc.Config{Issuer: testIssuer.URL(), Audience: testAudience, OrgClaim: "org_id"},
		testIssuer.Client(), slog.New(slog.NewTextHandler(io.Discard, nil)))
	if err != nil {
		log.Print(err)
		return 1
	}
	return m.Run()
}

// token は、組織 orgID の主張を持つトークンを返す。orgID が空なら組織のクレームを入れない。
func token(t *testing.T, orgID string) string {
	t.Helper()
	claims := testIssuer.Claims(testAudience, "sub-1")
	if orgID != "" {
		claims["org_id"] = orgID
	}
	raw, err := testIssuer.Sign(claims)
	if err != nil {
		t.Fatal(err)
	}
	return raw
}

// fakeAuth は、組織 testOrgID のトークンを事業所 facilityID の職員とみなす。
// FacilityOf は、otherScheduleID だけを事業所 otherFacilityID のものとする。
type fakeAuth struct{}

func (fakeAuth) Authenticate(_ context.Context, id auth.Identity) (auth.Principal, error) {
	if id.OrgID != testOrgID {
		return auth.Principal{}, domain.ErrForbidden
	}
	return auth.Principal{Staff: staff.Detail{Summary: staff.Summary{Staff: staff.Staff{ID: staffID, FacilityID: facilityID}}}}, nil
}

func (fakeAuth) FacilityOf(_ context.Context, r usecase.Resource, id string) (string, error) {
	switch {
	case r == usecase.ResourceFacility:
		return id, nil
	case id == otherScheduleID:
		return otherFacilityID, nil
	default:
		return facilityID, nil
	}
}

func TestUnauthenticated(t *testing.T) {
	expired := testIssuer.Claims(testAudience, "sub-1")
	expired["org_id"] = testOrgID
	expired["exp"] = time.Now().Add(-time.Hour).Unix()
	expiredRaw, err := testIssuer.Sign(expired)
	if err != nil {
		t.Fatal(err)
	}
	tests := []struct {
		name   string
		header string
		want   string
	}{
		{name: "トークンがない", want: "Bearer"},
		{name: "Bearer でない", header: "Basic dXNlcjpwYXNz", want: "Bearer"},
		{name: "形が JWT でない", header: "Bearer not-a-jwt", want: `Bearer error="invalid_token"`},
		{name: "期限切れ", header: "Bearer " + expiredRaw, want: `Bearer error="invalid_token"`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := &fakeSchedules{}
			req, _ := http.NewRequest(http.MethodGet, "/v1/facilities/"+facilityID+"/schedules", nil)
			if tt.header != "" {
				req.Header.Set("Authorization", tt.header)
			}
			rec := serve(newRouter(s, nil, nil), req)
			if rec.Code != http.StatusUnauthorized {
				t.Fatalf("status = %d, body = %s", rec.Code, rec.Body)
			}
			if got := rec.Header().Get("WWW-Authenticate"); got != tt.want {
				t.Errorf("WWW-Authenticate = %q, want %q", got, tt.want)
			}
			if !strings.Contains(rec.Body.String(), `"code":"unauthenticated"`) {
				t.Errorf("body = %s", rec.Body)
			}
			if s.listCalls != 0 {
				t.Error("usecase が呼ばれた")
			}
		})
	}
}

func TestForbidden(t *testing.T) {
	tests := []struct {
		name   string
		method string
		target string
		body   string
		org    string
	}{
		{name: "ほかの事業所の予定の一覧", method: http.MethodGet, target: "/v1/facilities/" + otherFacilityID + "/schedules", org: testOrgID},
		{name: "ほかの事業所に予定を作る", method: http.MethodPost, target: "/v1/facilities/" + otherFacilityID + "/schedules", body: "{}", org: testOrgID},
		{name: "ほかの事業所の予定", method: http.MethodGet, target: "/v1/schedules/" + otherScheduleID, org: testOrgID},
		{name: "ほかの事業所の予定のキャンセル", method: http.MethodPost, target: "/v1/schedules/" + otherScheduleID + "/cancel",
			body: `{"reason":"体調不良"}`, org: testOrgID},
		{name: "組織のクレームがない", method: http.MethodGet, target: "/v1/facilities/" + facilityID + "/schedules"},
		{name: "職員を特定できない組織", method: http.MethodGet, target: "/v1/facilities/" + facilityID + "/schedules", org: "org-x"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := &fakeSchedules{}
			rec, body := doWithToken(t, newRouter(s, nil, nil), tt.method, tt.target, tt.body, token(t, tt.org))
			if rec.Code != http.StatusForbidden || body["code"] != "forbidden" {
				t.Fatalf("status = %d, body = %s", rec.Code, rec.Body)
			}
			if s.listCalls != 0 || s.lastSlot.StaffID != "" {
				t.Error("usecase が呼ばれた")
			}
		})
	}
}

func TestAuthenticatedPassesThrough(t *testing.T) {
	h := newRouter(&fakeSchedules{}, nil, nil)
	for _, target := range []string{
		"/v1/facilities/" + facilityID + "/schedules",
		"/v1/schedules/" + scheduleID,
		"/v1/schedule_types",
	} {
		rec, _ := do(t, h, http.MethodGet, target, "")
		if rec.Code != http.StatusOK {
			t.Errorf("%s: status = %d, body = %s", target, rec.Code, rec.Body)
		}
	}
}
