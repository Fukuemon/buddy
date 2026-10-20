package handler

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"

	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain/auth"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain/staff"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/usecase"
)

func TestEveryPathParamHasResource(t *testing.T) {
	r := NewRouter(Usecases{}, RouterConfig{Logger: slog.New(slog.NewTextHandler(io.Discard, nil))})
	for _, route := range r.Routes() {
		for _, seg := range strings.Split(route.Path, "/") {
			if name, ok := strings.CutPrefix(seg, ":"); ok {
				if _, known := pathResources[name]; !known {
					t.Errorf("%s %s: 引数 %s の事業所を確かめられない", route.Method, route.Path, name)
				}
			}
		}
	}
}

type stubVerifier struct{}

func (stubVerifier) Verify(context.Context, string) (auth.Identity, error) {
	return auth.Identity{Subject: "sub-1", OrgID: "org-a"}, nil
}

type stubAuth struct{ principal auth.Principal }

func (s stubAuth) Authenticate(context.Context, auth.Identity) (auth.Principal, error) {
	return s.principal, nil
}

func (stubAuth) FacilityOf(context.Context, usecase.Resource, string) (string, error) { return "", nil }

func TestAuthenticatePutsPrincipalInContext(t *testing.T) {
	want := auth.Principal{Staff: staff.Detail{
		Summary:  staff.Summary{Staff: staff.Staff{ID: "STAFF", FacilityID: "FACILITY"}},
		Policies: []staff.PolicyGrant{{PolicyID: "POLICY", PolicyName: "すべてのカレンダーの閲覧"}},
	}}
	m := authMiddleware{verifier: stubVerifier{}, uc: stubAuth{principal: want}, log: slog.New(slog.NewTextHandler(io.Discard, nil))}
	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	var got auth.Principal
	var ok bool
	r.GET("/", m.authenticate, func(c *gin.Context) { got, ok = auth.PrincipalFrom(c.Request.Context()) })
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Bearer x")
	r.ServeHTTP(httptest.NewRecorder(), req)
	if !ok || got.Staff.ID != "STAFF" || len(got.Staff.Policies) != 1 {
		t.Fatalf("principal = %+v, ok = %v", got, ok)
	}
}
