package httpapi

import (
	"context"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"

	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/httpapi/openapi"
)

// Usecases は、ルーターがハンドラに渡す操作である。
type Usecases struct {
	Organization OrganizationUsecase
	Staff        StaffUsecase
	Patients     PatientUsecase
	VisitMasters VisitMasterUsecase
	Schedules    ScheduleUsecase
	Auth         AuthUsecase
}

// RouterConfig は、ルーターの設定である。AllowOrigins が空なら CORS のヘッダーを返さない。
// Ready は GET /readyz が依存先を確かめる関数で、nil なら常に要求を受けられるとみなす。
type RouterConfig struct {
	Logger       *slog.Logger
	AllowOrigins []string
	Verifier     TokenVerifier
	Ready        func(context.Context) error
}

// server は、openapi.yaml から生成した openapi.StrictServerInterface を実装する。
// 操作が返したエラーは、そのまま返して writeError に状態コードを決めさせる。
type server struct {
	u     Usecases
	ready func(context.Context) error
	log   *slog.Logger
}

var _ openapi.StrictServerInterface = server{}

// NewRouter は、openapi.yaml の GET /healthz、GET /readyz と /v1 の API を持つルーターを作る。/v1 は全て、Bearer のトークンと、
// パスが指す事業所が職員の事業所と一致することを求める。/healthz と /readyz は認証を求めない。
func NewRouter(u Usecases, cfg RouterConfig) *gin.Engine {
	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	// 生成した strict handler は *gin.Context を context として操作に渡すので、要求の取り消しと値を要求の context から引かせる
	r.ContextWithFallback = true
	r.Use(requestLog(cfg.Logger), gin.CustomRecovery(func(c *gin.Context, recovered any) {
		cfg.Logger.ErrorContext(c.Request.Context(), "panic", slog.Any("recovered", recovered), slog.String("path", c.FullPath()))
		c.AbortWithStatusJSON(http.StatusInternalServerError, errorResponse{Code: "internal", Message: "サーバーでエラーが発生しました"})
	}))
	if len(cfg.AllowOrigins) > 0 {
		r.Use(cors.New(cors.Config{
			AllowOrigins: cfg.AllowOrigins,
			AllowMethods: []string{http.MethodGet, http.MethodPost, http.MethodPut, http.MethodOptions},
			AllowHeaders: []string{"Content-Type", "Authorization"},
			MaxAge:       12 * time.Hour,
		}))
	}

	r.Use(rejectMalformedQuery)

	am := authMiddleware{verifier: cfg.Verifier, uc: u.Auth, log: cfg.Logger}
	r.Use(v1Only(am.authenticate), v1Only(am.checkFacility), v1Only(requireULIDParams))

	strict := openapi.NewStrictHandlerWithOptions(server{u: u, ready: cfg.Ready, log: cfg.Logger}, []openapi.StrictMiddlewareFunc{validateBody},
		openapi.StrictGinServerOptions{
			RequestErrorHandlerFunc: func(c *gin.Context, err error) {
				badRequest(c, bodyErrorPrefix+err.Error())
			},
			HandlerErrorFunc: func(c *gin.Context, err error) { writeError(c, cfg.Logger, err) },
			ResponseErrorHandlerFunc: func(c *gin.Context, err error) {
				writeError(c, cfg.Logger, err)
			},
		})
	openapi.RegisterHandlersWithOptions(r, strict, openapi.GinServerOptions{
		ErrorHandler: func(c *gin.Context, err error, _ int) {
			badRequest(c, "クエリの形が正しくありません: "+err.Error())
		},
	})
	return r
}

// v1Only は、/v1 の経路にだけ h を当てる。経路に当たらない要求（404）にも当てない。
func v1Only(h gin.HandlerFunc) gin.HandlerFunc {
	return func(c *gin.Context) {
		if !strings.HasPrefix(c.FullPath(), "/v1/") {
			c.Next()
			return
		}
		h(c)
	}
}

func requestLog(log *slog.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		c.Next()
		log.InfoContext(c.Request.Context(), "request",
			slog.String("method", c.Request.Method),
			slog.String("route", c.FullPath()),
			slog.Int("status", c.Writer.Status()),
			slog.Duration("latency", time.Since(start)),
		)
	}
}

// rejectMalformedQuery は、読めないクエリを 400 で返す。net/url は ";" を含む組を黙って捨てるので、
// "sort_field=start_time;DROP" が並べ替えの指定なしとして通らないよう、捨てる前に止める。
func rejectMalformedQuery(c *gin.Context) {
	if _, err := url.ParseQuery(c.Request.URL.RawQuery); err != nil {
		badRequest(c, "クエリの形が正しくありません: "+err.Error())
		return
	}
	c.Next()
}

// requireULIDParams は、パスの引数が ULID でないときに 400 を返す。/v1 のパスの引数は全て ID である。
func requireULIDParams(c *gin.Context) {
	for _, p := range c.Params {
		if !domain.ValidID(p.Value) {
			badRequest(c, p.Key+" は ULID です")
			return
		}
	}
	c.Next()
}
