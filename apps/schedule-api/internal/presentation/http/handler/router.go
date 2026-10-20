package handler

import (
	"log/slog"
	"net/http"
	"net/url"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

// Usecases は、ルーターがハンドラに渡す操作である。
type Usecases struct {
	Organization OrganizationUsecase
	Staff        StaffUsecase
	Patients     PatientUsecase
	VisitMasters VisitMasterUsecase
	Schedules    ScheduleUsecase
}

// RouterConfig は、ルーターの設定である。AllowOrigins が空なら CORS のヘッダーを返さない。
type RouterConfig struct {
	Logger       *slog.Logger
	AllowOrigins []string
}

// NewRouter は、GET /health と /v1 の API を持つルーターを作る。
func NewRouter(u Usecases, cfg RouterConfig) *gin.Engine {
	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	r.Use(requestLog(cfg.Logger), gin.CustomRecovery(func(c *gin.Context, recovered any) {
		cfg.Logger.ErrorContext(c.Request.Context(), "panic", slog.Any("recovered", recovered), slog.String("path", c.FullPath()))
		c.AbortWithStatusJSON(http.StatusInternalServerError, errorResponse{Code: "internal", Message: "サーバーでエラーが発生しました"})
	}))
	if len(cfg.AllowOrigins) > 0 {
		r.Use(cors.New(cors.Config{
			AllowOrigins: cfg.AllowOrigins,
			AllowMethods: []string{http.MethodGet, http.MethodPost, http.MethodOptions},
			AllowHeaders: []string{"Content-Type", "Authorization"},
			MaxAge:       12 * time.Hour,
		}))
	}

	r.Use(rejectMalformedQuery)

	r.GET("/health", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"status": "ok"}) })

	v1 := r.Group("/v1")
	organizationHandler{uc: u.Organization, log: cfg.Logger}.register(v1)
	staffHandler{uc: u.Staff, log: cfg.Logger}.register(v1)
	patientHandler{uc: u.Patients, log: cfg.Logger}.register(v1)
	visitHandler{uc: u.VisitMasters, log: cfg.Logger}.register(v1)
	scheduleHandler{uc: u.Schedules, log: cfg.Logger}.register(v1)
	return r
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
