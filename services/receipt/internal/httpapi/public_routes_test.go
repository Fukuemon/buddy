package httpapi

import (
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"regexp"
	"strings"
	"testing"

	"gopkg.in/yaml.v3"
)

// TestOnlyHealthChecksArePublic は、openapi.yaml の全ての操作と publicPaths のパスのうち、トークンの無いリクエストを 401 で
// 拒まないものが GET /healthz と GET /readyz だけであることを確認する。照合の API はインターネットから届くので、認証を求めない
// ルートを足すときは、context/operations.md の「Public Routes」のとおりインフラの側に知らせ、規則とこのテストを直す。
// http.ServeMux は登録したルートを返せないので、ルートは生成元の openapi.yaml と、authenticate が素通しする publicPaths から集める。
func TestOnlyHealthChecksArePublic(t *testing.T) {
	public := map[string]bool{"GET /healthz": true, "GET /readyz": true}
	raw, err := os.ReadFile("../../openapi.yaml")
	if err != nil {
		t.Fatal(err)
	}
	var spec struct {
		Paths map[string]map[string]any `yaml:"paths"`
	}
	if err := yaml.Unmarshal(raw, &spec); err != nil {
		t.Fatal(err)
	}
	param := regexp.MustCompile(`\{[^}]+\}`)
	// 定義に無いパスと、ヘルスチェックの下のパスも調べる。publicPaths の完全一致を前方一致に変えた誤りを見つけるためである
	routes := map[string]bool{"GET /no-such-path": true, "GET /healthz/x": true, "GET /readyz/x": true}
	methods := map[string]bool{"get": true, "put": true, "post": true, "delete": true, "options": true, "head": true, "patch": true, "trace": true}
	for path, item := range spec.Paths {
		for k := range item {
			switch {
			case methods[k]:
				routes[strings.ToUpper(k)+" "+param.ReplaceAllString(path, "x")] = true
			case k == "parameters" || k == "summary" || k == "description" || strings.HasPrefix(k, "x-"):
			default:
				t.Fatalf("%s の %s を読めない。操作を漏らさないよう、このテストを直す", path, k)
			}
		}
	}
	for path := range publicPaths {
		routes[http.MethodGet+" "+path] = true
	}
	if len(routes) <= len(public)+1 {
		t.Fatalf("openapi.yaml からルートを読めていない: %v", routes)
	}
	h := NewHandler(slog.New(slog.NewTextHandler(io.Discard, nil)), Config{MaxUploadBytes: 1 << 20, Verifier: fakeVerifier{}, Permission: fakePermission{}})
	for key := range routes {
		method, path, _ := strings.Cut(key, " ")
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequest(method, path, nil))
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
}
