// Command api は、照合の HTTP の API のサーバーを起動する。
//
// 環境変数:
//
//   - PORT: 待ち受けるポート。デフォルトは 8080。
//   - MAX_UPLOAD_BYTES: POST /v1/checks の本文の上限のバイト数。デフォルトは 10485760（10 MiB）。
//   - LOG_LEVEL: debug、info、warn、error のいずれか。デフォルトは info。
//   - OIDC_ISSUER: 必須。ブローカーの Issuer の URL。トークンの iss と一致させ、discovery の文書をここから読む。
//   - OIDC_AUDIENCE: 必須。トークンの aud に求める値。
//   - OIDC_ORG_CLAIM: 組織の ID を持つクレームの名前。デフォルトは org_id。
//   - CORS_ALLOW_ORIGINS: CORS でレスポンスを読ませるオリジンを、カンマで区切って並べる。空なら CORS のヘッダーを返さない。
//   - GOOGLE_CALENDARS_FILE: 照合の対象のカレンダーの設定（JSON）のパス。空なら Google カレンダーを使わない。
//     形は gcal.LoadCalendars にある。トークンの組織に結び付けたカレンダーだけを読む。
//   - GOOGLE_CALENDAR_SERVICE_ACCOUNTS_FILE: 組織の ID と、その事業所の職員がカレンダーを共有するサービスアカウントの対応（JSON）のパス。
//     GOOGLE_CALENDARS_FILE と一緒に渡す。形は gcalauth.LoadAccounts にあり、予定の API と同じである。
//     カレンダーは、Application Default Credentials で認証し、カレンダーの組織のサービスアカウントになりすまして読む（ADR-0012）。
//   - GOOGLE_CALENDAR_ENDPOINT: Calendar API の代わりに呼ぶ URL。ローカル環境の calendarpit で試すためのもので、GOOGLE_APPLICATION_CREDENTIALS を渡したときだけ、その認証情報をなりすまさずに全ての事業所で使い、渡さなければ認証をしない。
//
// `api healthcheck` は、サーバーを起動せず、動いているサーバーの GET /readyz を確かめて終わる。
//
// SIGINT か SIGTERM を受けると、処理中のリクエストを待ってから終了する。設定のエラーと起動の失敗では終了コード 1 で終わる。
package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/Fukuemon/buddy/packages/go/healthcheck"

	"google.golang.org/api/calendar/v3"

	"github.com/Fukuemon/buddy/packages/go/gcalauth"
	"github.com/Fukuemon/buddy/packages/go/oidc"

	"github.com/Fukuemon/buddy/services/receipt/internal/gcal"
	"github.com/Fukuemon/buddy/services/receipt/internal/httpapi"
	"github.com/Fukuemon/buddy/services/receipt/internal/source"
)

type config struct {
	port             string
	maxUploadBytes   int64
	logLevel         slog.Level
	calendarsFile    string
	accountsFile     string
	calendarEndpoint string
	oidc             oidc.Config
	allowOrigins     []string
}

func loadConfig(getenv func(string) string) (config, error) {
	cfg := config{port: "8080", maxUploadBytes: 10 << 20, logLevel: slog.LevelInfo}
	cfg.oidc = oidc.Config{Issuer: getenv("OIDC_ISSUER"), Audience: getenv("OIDC_AUDIENCE"), OrgClaim: getenv("OIDC_ORG_CLAIM")}
	var missing []string
	if cfg.oidc.Issuer == "" {
		missing = append(missing, "OIDC_ISSUER")
	}
	if cfg.oidc.Audience == "" {
		missing = append(missing, "OIDC_AUDIENCE")
	}
	if len(missing) > 0 {
		return config{}, fmt.Errorf("環境変数 %s が必要である", strings.Join(missing, "、"))
	}
	if cfg.oidc.OrgClaim == "" {
		cfg.oidc.OrgClaim = "org_id"
	}
	if v := getenv("PORT"); v != "" {
		cfg.port = v
	}
	if v := getenv("MAX_UPLOAD_BYTES"); v != "" {
		n, err := strconv.ParseInt(v, 10, 64)
		if err != nil || n <= 0 {
			return config{}, fmt.Errorf("MAX_UPLOAD_BYTES は正の整数にする: %q", v)
		}
		cfg.maxUploadBytes = n
	}
	if v := getenv("LOG_LEVEL"); v != "" {
		if err := cfg.logLevel.UnmarshalText([]byte(v)); err != nil {
			return config{}, fmt.Errorf("LOG_LEVEL が不正: %w", err)
		}
	}
	for _, o := range strings.Split(getenv("CORS_ALLOW_ORIGINS"), ",") {
		if o = strings.TrimSpace(o); o != "" {
			cfg.allowOrigins = append(cfg.allowOrigins, o)
		}
	}
	cfg.calendarsFile = getenv("GOOGLE_CALENDARS_FILE")
	cfg.accountsFile = getenv("GOOGLE_CALENDAR_SERVICE_ACCOUNTS_FILE")
	cfg.calendarEndpoint = getenv("GOOGLE_CALENDAR_ENDPOINT")
	if cfg.calendarEndpoint != "" && cfg.calendarsFile == "" {
		return config{}, errors.New("GOOGLE_CALENDAR_ENDPOINT は GOOGLE_CALENDARS_FILE と一緒に渡す")
	}
	if (cfg.calendarsFile == "") != (cfg.accountsFile == "") {
		return config{}, errors.New("GOOGLE_CALENDARS_FILE と GOOGLE_CALENDAR_SERVICE_ACCOUNTS_FILE は一緒に渡す")
	}
	return cfg, nil
}

// newCalendarReader は、cfg.calendarsFile のカレンダーを、カレンダーの組織のサービスアカウントで読む gcal.Reader を返す。
// 設定が無ければ nil を返す。サービスアカウントの対応が無い組織のカレンダーがあれば、起動しない。
func newCalendarReader(ctx context.Context, cfg config) (*gcal.Reader, error) {
	if cfg.calendarsFile == "" {
		return nil, nil
	}
	cals, err := gcal.LoadCalendars(cfg.calendarsFile)
	if err != nil {
		return nil, err
	}
	accounts, err := gcalauth.LoadAccounts(cfg.accountsFile)
	if err != nil {
		return nil, err
	}
	if err := requireAccounts(cals, accounts); err != nil {
		return nil, err
	}
	clients, err := gcalauth.New(ctx, gcalauth.Config{Accounts: accounts, Scope: calendar.CalendarReadonlyScope, Endpoint: cfg.calendarEndpoint})
	if err != nil {
		return nil, err
	}
	return gcal.NewReader(clients, cals), nil
}

// requireAccounts は、cals の全ての組織に、accounts のサービスアカウントの対応があるかを確かめる。
func requireAccounts(cals []gcal.Calendar, accounts gcalauth.Accounts) error {
	for _, c := range cals {
		if _, ok := accounts.Of(c.OrgID); !ok {
			return fmt.Errorf("組織 %s のサービスアカウントが GOOGLE_CALENDAR_SERVICE_ACCOUNTS_FILE に無い", c.OrgID)
		}
	}
	return nil
}

func main() {
	if len(os.Args) > 1 && os.Args[1] == "healthcheck" {
		os.Exit(healthcheck.Run())
	}
	if err := run(); err != nil {
		slog.Error("終了する", "error", err)
		os.Exit(1)
	}
}

func run() error {
	cfg, err := loadConfig(os.Getenv)
	if err != nil {
		return err
	}
	logger := slog.New(slog.NewJSONHandler(os.Stderr, &slog.HandlerOptions{Level: cfg.logLevel}))

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	reader, err := newCalendarReader(ctx, cfg)
	if err != nil {
		return err
	}
	logger.Info("Google カレンダーのデータソースの設定を読んだ", "enabled", reader != nil)

	verifier, err := oidc.NewVerifier(ctx, cfg.oidc, nil, logger)
	if err != nil {
		return err
	}

	srv := &http.Server{
		Addr: ":" + cfg.port,
		Handler: httpapi.NewHandler(logger, httpapi.Config{
			MaxUploadBytes: cfg.maxUploadBytes,
			Sources:        source.Selector{Calendar: reader},
			Verifier:       verifier,
			AllowOrigins:   cfg.allowOrigins,
		}),
		ReadHeaderTimeout: 10 * time.Second,
		ErrorLog:          slog.NewLogLogger(logger.Handler(), slog.LevelError),
	}

	errCh := make(chan error, 1)
	go func() {
		logger.Info("待ち受けを始める", "addr", srv.Addr)
		errCh <- srv.ListenAndServe()
	}()

	select {
	case err := <-errCh:
		return err
	case <-ctx.Done():
	}

	logger.Info("終了の処理を始める")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		return err
	}
	if err := <-errCh; !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	return nil
}
