package httpapi_test

import (
	"go/ast"
	"go/parser"
	"go/token"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"testing"

	"github.com/Fukuemon/buddy/services/broker/internal/httpapi"
	"github.com/Fukuemon/buddy/services/broker/internal/internalapi"
)

// TestOnlyHealthChecksArePublic は、内部の API のポートが受けるルートのうち、資格情報（access token と Token-Hook-Key）の
// 無いリクエストを 401 で拒まないものが GET /healthz と GET /readyz だけであることを確認する。内部の API はインターネットから届くので、
// 認証を求めないルートを足すときは、context/operations.md の「Public Routes」のとおりインフラの側に知らせ、規則とこのテストを直す。
// ログインの画面はインターネットから開く画面なので、対象にしない。
// http.ServeMux は登録したルートを返せないので、httpapi と internalapi のソースから Handle と HandleFunc のルートを読む。
func TestOnlyHealthChecksArePublic(t *testing.T) {
	public := map[string]bool{"GET /healthz": true, "GET /readyz": true}
	routes := registeredPatterns(t, ".", "../internalapi")
	if len(routes) <= len(public) {
		t.Fatalf("ルートを読めていない: %v", routes)
	}
	logger := slog.New(slog.DiscardHandler)
	h := httpapi.NewHandler(httpapi.Config{
		Logger:   logger,
		Internal: internalapi.NewHandler(internalapi.Config{Logger: logger, TokenHookKey: strings.Repeat("k", 32)}),
	})
	param := regexp.MustCompile(`\{[^}]+\}`)
	for _, pattern := range routes {
		method, path, ok := strings.Cut(pattern, " ")
		if !ok {
			method, path = http.MethodGet, pattern
		}
		key := method + " " + path
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequest(method, param.ReplaceAllString(path, "x"), nil))
		if public[key] {
			if rec.Code == http.StatusUnauthorized {
				t.Errorf("%s: 認証を求めないルートが 401 を返した", key)
			}
			continue
		}
		if rec.Code != http.StatusUnauthorized {
			t.Errorf("%s: 資格情報の無いリクエストに %d を返した。認証を求めないルートは /healthz と /readyz だけにする", key, rec.Code)
		}
	}
}

// registeredPatterns は、dirs のテストでないソースにある、Handle と HandleFunc に渡したルートを返す。
// 内部の API の全体を渡す /internal/ と、ログインの画面のルートを渡す login.Paths の要素は返さない。
// ほかに文字列のリテラルでないルートがあれば、テストを失敗させる。読めないルートを対象から漏らさないためである。
func registeredPatterns(t *testing.T, dirs ...string) []string {
	t.Helper()
	skip := map[string]bool{"/internal/": true}
	var patterns []string
	fset := token.NewFileSet()
	for _, dir := range dirs {
		files, err := filepath.Glob(filepath.Join(dir, "*.go"))
		if err != nil {
			t.Fatal(err)
		}
		for _, name := range files {
			if strings.HasSuffix(name, "_test.go") {
				continue
			}
			f, err := parser.ParseFile(fset, name, nil, 0)
			if err != nil {
				t.Fatal(err)
			}
			ast.Inspect(f, func(n ast.Node) bool {
				call, ok := n.(*ast.CallExpr)
				if !ok || len(call.Args) != 2 {
					return true
				}
				sel, ok := call.Fun.(*ast.SelectorExpr)
				if !ok || (sel.Sel.Name != "Handle" && sel.Sel.Name != "HandleFunc") {
					return true
				}
				if lit, ok := call.Args[0].(*ast.BasicLit); ok && lit.Kind == token.STRING {
					p, err := strconv.Unquote(lit.Value)
					if err != nil {
						t.Fatal(err)
					}
					if !skip[p] {
						patterns = append(patterns, p)
					}
					return true
				}
				if id, ok := call.Args[0].(*ast.Ident); ok && id.Name == "p" && filepath.Base(name) == "httpapi.go" {
					return true
				}
				t.Errorf("%s: ルートが文字列のリテラルでないので、認証を求めるかを確認できない", fset.Position(call.Pos()))
				return true
			})
		}
	}
	return patterns
}
