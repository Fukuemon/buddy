package httpapi

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/getkin/kin-openapi/routers/gorillamux"
	"github.com/gin-gonic/gin"

	"github.com/Fukuemon/buddy/apps/schedule-api/internal/access"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/auth"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/httpapi/openapi"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/staff"
)

// TestEveryV1RouteIsInSpec は、gin に登録した /v1 の経路が全て openapi.yaml の定義にあることを確かめる。
// 定義に無い経路は、要求の検証を通らずに handler に届くためである。
func TestEveryV1RouteIsInSpec(t *testing.T) {
	spec, err := openapi.GetSpec()
	if err != nil {
		t.Fatal(err)
	}
	spec.Servers = nil
	router, err := gorillamux.NewRouter(spec)
	if err != nil {
		t.Fatal(err)
	}
	r := NewRouter(Usecases{}, RouterConfig{Logger: slog.New(slog.NewTextHandler(io.Discard, nil))})
	for _, route := range r.Routes() {
		if !strings.HasPrefix(route.Path, "/v1/") {
			continue
		}
		segs := strings.Split(route.Path, "/")
		for i, seg := range segs {
			if strings.HasPrefix(seg, ":") {
				segs[i] = "01M3TC5H00QV17BC0J9V3393ZP"
			}
		}
		req := httptest.NewRequest(route.Method, strings.Join(segs, "/"), nil)
		if _, _, err := router.FindRoute(req); err != nil {
			t.Errorf("%s %s: 定義に無い: %v", route.Method, route.Path, err)
		}
	}
}

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

func (stubAuth) FacilityOf(context.Context, access.Resource, string) (string, error) { return "", nil }

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
