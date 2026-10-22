package httpapi

import (
	"context"
	"net/http"
	"strings"

	"github.com/Fukuemon/buddy/packages/go/oidc"

	"github.com/Fukuemon/buddy/apps/receipt-api/internal/httpapi/openapi"
)

// TokenVerifier は、Authorization ヘッダーの Bearer のトークンを検証する。検証に失敗したときはエラーを返す。
type TokenVerifier interface {
	Verify(ctx context.Context, raw string) (oidc.Identity, error)
}

// publicPaths は、openapi.yaml で `security: []` にした、トークンを求めないパスである。
var publicPaths = map[string]bool{"/healthz": true, "/readyz": true}

type identityKey struct{}

// identityFrom は、authenticate が ctx に入れたトークンの主張を返す。
func identityFrom(ctx context.Context) oidc.Identity {
	id, _ := ctx.Value(identityKey{}).(oidc.Identity)
	return id
}

// authenticate は、publicPaths 以外のリクエストの Bearer のトークンを検証し、主張を request の context に入れる。
// トークンがないか検証に失敗したときは 401 を返す。
func (s *server) authenticate(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if publicPaths[r.URL.Path] {
			next.ServeHTTP(w, r)
			return
		}
		raw, ok := bearerToken(r.Header.Get("Authorization"))
		if !ok {
			s.unauthorized(w, `Bearer`, "認証が必要である")
			return
		}
		id, err := s.cfg.Verifier.Verify(r.Context(), raw)
		if err != nil {
			s.logger.InfoContext(r.Context(), "トークンが正しくない", "error", err)
			s.unauthorized(w, `Bearer error="invalid_token"`, "トークンが正しくない")
			return
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), identityKey{}, id)))
	})
}

// unauthorized は、RFC 6750 の 3 節に従い、WWW-Authenticate を付けて 401 を返す。
// https://www.rfc-editor.org/rfc/rfc6750#section-3
func (s *server) unauthorized(w http.ResponseWriter, challenge, message string) {
	w.Header().Set("WWW-Authenticate", challenge)
	s.writeJSON(w, http.StatusUnauthorized, errorBody(openapi.Unauthenticated, message))
}

// bearerToken は、"Bearer <token>" の <token> を返す。スキームの大文字と小文字は区別しない（RFC 7235 の 2.1 節）。
func bearerToken(header string) (string, bool) {
	scheme, token, ok := strings.Cut(header, " ")
	if !ok || !strings.EqualFold(scheme, "Bearer") {
		return "", false
	}
	token = strings.TrimSpace(token)
	return token, token != ""
}
