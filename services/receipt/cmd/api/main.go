// Command api は、照合の HTTP の API のサーバーを起動する。
//
// 環境変数:
//
//   - PORT: 待ち受けるポート。1 から 65535 の数にする。デフォルトは 8080。
//   - MAX_UPLOAD_BYTES: POST /v1/checks の本文の上限のバイト数。デフォルトは 10485760（10 MiB）。
//   - LOG_LEVEL: debug、info、warn、error のいずれか。デフォルトは info。
//   - OIDC_ISSUER: 必須。Hydra の Issuer の URL。トークンの iss と一致させ、discovery の文書をここから読む。
//   - OIDC_AUDIENCE: 必須。トークンの aud に求める値。
//   - OIDC_ORG_CLAIM: 組織の ID を持つクレームの名前。デフォルトは org_id。
//   - SCHEDULE_URL: 必須。予定の API の URL（`http://schedule:8080` の形）。照合の前に、受けたトークンで GET /v1/me を呼び、照合の権限を確認する（ADR-0007）。
//   - CORS_ALLOW_ORIGINS: CORS でレスポンスを読ませるオリジンを、カンマで区切って並べる。空なら CORS のヘッダーを返さない。
//   - GOOGLE_CALENDARS_FILE: 照合の対象のカレンダーの設定（JSON）のパス。空なら Google カレンダーを使わない。
//     形は gcal.LoadCalendars にある。トークンの組織に結び付けたカレンダーだけを読む。
//   - GOOGLE_CALENDAR_SERVICE_ACCOUNTS_FILE: 組織の ID と、その事業所の職員がカレンダーを共有するサービスアカウントの対応（JSON）のパス。
//     GOOGLE_CALENDARS_FILE と一緒に渡す。形は gcalauth.LoadAccounts にあり、予定の API と同じである。
//     カレンダーは、Application Default Credentials で認証し、カレンダーの組織のサービスアカウントになりすまして読む（ADR-0027）。
//   - GOOGLE_CALENDAR_ENDPOINT: Calendar API の代わりに呼ぶ URL。ローカル環境の calendarpit で試すためのもので、GOOGLE_APPLICATION_CREDENTIALS を渡したときだけ、その認証情報をなりすまさずに全ての事業所で使い、渡さなければ認証をしない。
//
// `api healthcheck` は、サーバーを起動せず、動いているサーバーの GET /readyz を確認して終わる。
//
// SIGINT か SIGTERM を受けると、処理中のリクエストを待ってから終了する。設定のエラーと起動の失敗では終了コード 1 で終わる。
package main

import (
	"context"
	"errors"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/Fukuemon/buddy/packages/go/healthcheck"
	"github.com/Fukuemon/buddy/packages/go/oidc"

	"github.com/Fukuemon/buddy/services/receipt/internal/httpapi"
	"github.com/Fukuemon/buddy/services/receipt/internal/permission"
	"github.com/Fukuemon/buddy/services/receipt/internal/source"
)

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
	checker, err := permission.NewChecker(cfg.scheduleURL)
	if err != nil {
		return err
	}

	srv := &http.Server{
		Addr: net.JoinHostPort("", cfg.port),
		Handler: httpapi.NewHandler(logger, httpapi.Config{
			MaxUploadBytes: cfg.maxUploadBytes,
			Sources:        source.Selector{Calendar: reader},
			Verifier:       verifier,
			Permission:     checker,
			AllowOrigins:   cfg.allowOrigins,
		}),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		// WriteTimeout は本文を読む時間（ReadTimeout まで）も含むので、本文を読むのに 30 秒近くかかっても照合の時間が残るよう、ReadTimeout より長くする。
		// 切れても照合の処理は止まらず、レスポンスを書けずに接続が切れるだけである。
		WriteTimeout: 60 * time.Second,
		IdleTimeout:  60 * time.Second,
		ErrorLog:     slog.NewLogLogger(logger.Handler(), slog.LevelError),
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
