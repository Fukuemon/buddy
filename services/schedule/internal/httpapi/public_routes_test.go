package httpapi_test

import (
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/Fukuemon/buddy/services/schedule/internal/httpapi"
)

// TestOnlyHealthChecksArePublic は、ルーターに登録した全てのルートのうち、トークンの無いリクエストを 401 で拒まないものが
// GET /healthz と GET /readyz だけであることを確認する。予定の API はインターネットから届くので、認証を求めないルートを足すときは、
// context/operations.md の「Public Routes」のとおりインフラの側に知らせ、規則とこのテストを直す。
func TestOnlyHealthChecksArePublic(t *testing.T) {
	public := map[string]bool{"GET /healthz": true, "GET /readyz": true}
	r := httpapi.NewRouter(httpapi.Apps{}, httpapi.RouterConfig{Logger: slog.New(slog.NewTextHandler(io.Discard, nil))})
	routes := r.Routes()
	if len(routes) <= len(public) {
		t.Fatalf("ルートが %d しか登録されていない", len(routes))
	}
	for _, route := range routes {
		key := route.Method + " " + route.Path
		segs := strings.Split(route.Path, "/")
		for i, seg := range segs {
			if strings.HasPrefix(seg, ":") || strings.HasPrefix(seg, "*") {
				segs[i] = "01M3TC5H00QV17BC0J9V3393ZP"
			}
		}
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, httptest.NewRequest(route.Method, strings.Join(segs, "/"), nil))
		if public[key] {
			if rec.Code == http.StatusUnauthorized {
				t.Errorf("%s: 認証を求めないルートが 401 を返した", key)
			}
			continue
		}
		if rec.Code != http.StatusUnauthorized {
			t.Errorf("%s: トークンの無いリクエストに %d を返した。認証を求めないルートは /healthz と /readyz だけにする", key, rec.Code)
		}
	}
	// Routes() は NoRoute のハンドラと、ルートに当たる前に応答するミドルウェアを返さない。登録していないパスが 404 になることで、それらが無いことを確認する
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/no-such-path", nil))
	if rec.Code != http.StatusNotFound {
		t.Errorf("GET /no-such-path: 登録していないパスに %d を返した。ルートに当たらないリクエストには認証を当てないので、404 のほかを返さない", rec.Code)
	}
}
