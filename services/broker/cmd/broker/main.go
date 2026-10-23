// Command broker は、Ory Hydra の login and consent app として動く認証のブローカーを起動する（ADR-0016）。
// 今はヘルスチェックだけを持ち、ログイン、同意、ログアウトの画面と内部の API は後から足す。
//
// 設定は環境変数から読む。読む値とデフォルト値は config.Load にある。
// 上流の IdP の設定のファイルか client secret のファイルに誤りがあれば、待ち受けを始めずに終了コード 1 で終わる。
//
// `broker healthcheck` は、サーバーを起動せず、動いているサーバーの GET /readyz を確かめて終わる。
//
// SIGINT か SIGTERM を受けると、処理中のリクエストを待ってから終了する。
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

	"github.com/Fukuemon/buddy/services/broker/internal/config"
	"github.com/Fukuemon/buddy/services/broker/internal/httpapi"
	"github.com/Fukuemon/buddy/services/broker/internal/postgres"
	"github.com/Fukuemon/buddy/services/broker/internal/upstream"
)

// readyTimeout は、GET /readyz が DB の疎通を待つ上限である。
const readyTimeout = 2 * time.Second

func main() {
	if len(os.Args) > 1 && os.Args[1] == "healthcheck" {
		os.Exit(healthcheck.Run())
	}
	if err := run(os.Getenv); err != nil {
		slog.Error("終了する", "error", err)
		os.Exit(1)
	}
}

// run は、getenv（本番では os.Getenv）の設定でブローカーを起動し、止まる合図を受けるまで待ち受ける。
// 上流の IdP の設定は DB に接続する前に読み、誤りがあれば DB に触れずにエラーを返す。
func run(getenv func(string) string) error {
	cfg, err := config.Load(getenv)
	if err != nil {
		return err
	}
	logger := slog.New(slog.NewJSONHandler(os.Stderr, &slog.HandlerOptions{Level: cfg.LogLevel}))

	idps, err := upstream.Load(cfg.UpstreamIdPsFile, cfg.UpstreamClientSecretsFile)
	if err != nil {
		return err
	}
	logger.Info("上流の IdP の設定を読んだ", "count", len(idps))

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	db, err := postgres.Open(ctx, postgres.Config(cfg.DB))
	if err != nil {
		return err
	}
	defer db.Close()

	srv := &http.Server{
		Addr: net.JoinHostPort("", cfg.Port),
		Handler: httpapi.NewHandler(httpapi.Config{Logger: logger, Ready: func(ctx context.Context) error {
			ctx, cancel := context.WithTimeout(ctx, readyTimeout)
			defer cancel()
			return db.Ping(ctx)
		}}),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
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
