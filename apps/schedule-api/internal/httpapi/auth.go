package httpapi

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/Fukuemon/buddy/apps/schedule-api/internal/apperr"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/authn"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/principal"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/ulid"
)

// TokenVerifier は、Authorization ヘッダーの Bearer のトークンを検証する。検証に失敗したときはエラーを返す。
type TokenVerifier interface {
	Verify(ctx context.Context, raw string) (principal.Identity, error)
}

// AuthUsecase は、認証のミドルウェアが使う操作である。
type AuthUsecase interface {
	Authenticate(ctx context.Context, id principal.Identity) (principal.Principal, error)
	FacilityOf(ctx context.Context, r authn.Resource, id string) (string, error)
}

// pathResources は、/v1 のパスの引数の名前と、その ID が指すリソースである。
// global は、ミドルウェアが事業所を確かめない引数である。事業所に属さないリソースか、同じパスのほかの引数で事業所を確かめるリソースに付ける。
var pathResources = map[string]struct {
	resource authn.Resource
	global   bool
}{
	"facility_id":           {resource: authn.ResourceFacility},
	"department_id":         {resource: authn.ResourceDepartment},
	"team_id":               {resource: authn.ResourceTeam},
	"position_id":           {resource: authn.ResourcePosition},
	"user_id":               {resource: authn.ResourceStaff},
	"schedule_id":           {resource: authn.ResourceSchedule},
	"recurring_schedule_id": {resource: authn.ResourceRecurringSchedule},
	"policy_id":             {global: true},
	// 職員の権限の ID は、同じパスの user_id で事業所を確かめ、staff.Usecase が職員の権限かを確かめる。
	"user_policy_id": {global: true},
}

type authMiddleware struct {
	verifier TokenVerifier
	uc       AuthUsecase
	log      *slog.Logger
}

// authenticate は、Bearer のトークンを検証し、職員を特定して request の context に入れる。
// トークンがないか検証に失敗したときは 401 を、職員を特定できないときは 403 を返す。
func (m authMiddleware) authenticate(c *gin.Context) {
	raw, ok := bearerToken(c.GetHeader("Authorization"))
	if !ok {
		unauthorized(c, `Bearer`, "認証が必要です")
		return
	}
	id, err := m.verifier.Verify(c.Request.Context(), raw)
	if err != nil {
		m.log.InfoContext(c.Request.Context(), "invalid token", slog.Any("error", err))
		unauthorized(c, `Bearer error="invalid_token"`, "トークンが正しくありません")
		return
	}
	p, err := m.uc.Authenticate(c.Request.Context(), id)
	if err != nil {
		m.deny(c, err)
		return
	}
	c.Request = c.Request.WithContext(principal.With(c.Request.Context(), p))
	c.Next()
}

// checkFacility は、パスの ID が指すリソースの事業所が、職員の事業所と違うときに 403 を返す。
// ID の形が誤っているときとリソースが見つからないときは、requireULIDParams とハンドラが 400 と 404 を返すよう、そのまま通す。
// pathResources にない引数を持つ経路は、確かめられないので 500 を返す。
func (m authMiddleware) checkFacility(c *gin.Context) {
	p, ok := principal.From(c.Request.Context())
	if !ok {
		writeError(c, m.log, errors.New("認証のミドルウェアより前に事業所を確かめました"))
		return
	}
	for _, param := range c.Params {
		r, known := pathResources[param.Key]
		if !known {
			writeError(c, m.log, errors.New("事業所を確かめられないパスの引数 "+param.Key+" です"))
			return
		}
		if r.global || !ulid.Valid(param.Value) {
			continue
		}
		facilityID, err := m.uc.FacilityOf(c.Request.Context(), r.resource, param.Value)
		if errors.Is(err, apperr.ErrNotFound) {
			continue
		}
		if err != nil {
			writeError(c, m.log, err)
			return
		}
		if facilityID != p.Staff.FacilityID {
			m.deny(c, apperr.ErrForbidden)
			return
		}
	}
	c.Next()
}

func (m authMiddleware) deny(c *gin.Context, err error) {
	if !errors.Is(err, apperr.ErrForbidden) {
		writeError(c, m.log, err)
		return
	}
	m.log.InfoContext(c.Request.Context(), "forbidden", slog.String("path", c.FullPath()), slog.Any("reason", err))
	c.AbortWithStatusJSON(http.StatusForbidden, errorResponse{Code: "forbidden", Message: apperr.ErrForbidden.Error()})
}

// unauthorized は、RFC 6750 の 3 節に従い、WWW-Authenticate を付けて 401 を返す。
// https://www.rfc-editor.org/rfc/rfc6750#section-3
func unauthorized(c *gin.Context, challenge, message string) {
	c.Header("WWW-Authenticate", challenge)
	c.AbortWithStatusJSON(http.StatusUnauthorized, errorResponse{Code: "unauthenticated", Message: message})
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
