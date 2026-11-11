package httpapi

import (
	"context"
	"errors"
	"net/http"
	"strings"

	"github.com/Fukuemon/buddy/packages/go/oidc"

	"github.com/Fukuemon/buddy/services/receipt/internal/httpapi/openapi"
)

// publicPaths は、openapi.yaml で `security: []` にした、トークンを求めないパスである。
var publicPaths = map[string]bool{"/healthz": true, "/readyz": true}

type identityKey struct{}

type tokenKey struct{}

// identityFrom は、authenticate が ctx に入れたトークンの主張を返す。
func identityFrom(ctx context.Context) oidc.Identity {
	id, _ := ctx.Value(identityKey{}).(oidc.Identity)
	return id
}

// tokenFrom は、authenticate が検証して ctx に入れた access token を返す。予定の API に同じトークンを付けて呼ぶのに使う。
func tokenFrom(ctx context.Context) string {
	raw, _ := ctx.Value(tokenKey{}).(string)
	return raw
}

// authenticate は、publicPaths 以外のリクエストの Bearer のトークンを検証し、主張とトークンを request の context に入れる。
// トークンがないか検証に失敗したときは 401 を返す。
// トークンを検証する準備ができていないとき（oidc.ErrNotReady）は、トークンを通さずに 503（code は auth_unavailable）を返す。
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
		if errors.Is(err, oidc.ErrNotReady) {
			s.logger.WarnContext(r.Context(), "トークンを検証する準備ができていない", "error", err)
			s.writeJSON(w, http.StatusServiceUnavailable, errorBody(openapi.AuthUnavailable, "認証の準備ができていない。時間をおいてやり直す"))
			return
		}
		if err != nil {
			s.logger.InfoContext(r.Context(), "トークンが正しくない", "error", err)
			s.unauthorized(w, `Bearer error="invalid_token"`, "トークンが正しくない")
			return
		}
		ctx := context.WithValue(context.WithValue(r.Context(), identityKey{}, id), tokenKey{}, raw)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// unauthorized は、RFC 6750 のセクション 3 に従い、WWW-Authenticate を付けて 401 を返す。
// https://www.rfc-editor.org/rfc/rfc6750#section-3
func (s *server) unauthorized(w http.ResponseWriter, challenge, message string) {
	w.Header().Set("WWW-Authenticate", challenge)
	s.writeJSON(w, http.StatusUnauthorized, errorBody(openapi.Unauthenticated, message))
}

// bearerToken は、"Bearer <token>" の <token> を返す。スキームの大文字と小文字は区別しない（RFC 7235 のセクション 2.1）。
func bearerToken(header string) (string, bool) {
	scheme, token, ok := strings.Cut(header, " ")
	if !ok || !strings.EqualFold(scheme, "Bearer") {
		return "", false
	}
	token = strings.TrimSpace(token)
	return token, token != ""
}
