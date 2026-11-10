// Command api は、予定の API の HTTP サーバーを起動する。SIGINT か SIGTERM を受けると、
// 処理中のリクエストを最大 30 秒待ってから止まる。設定は internal/config の LoadAPI が読む環境変数である。
// `api healthcheck` は、サーバーを起動せず、動いているサーバーの GET /readyz を確認して終わる。
// 依存の組み立ては handler.go にあり、main.go はサーバーを起動して止める。
// Google カレンダーの書き出しと同期の常駐の処理は起動せず、cmd/calendar-worker が動かす（ADR-0032）。
// 書き出しを有効にした設定では、予定の変更を書き出しの待ちに積み、待ちは cmd/calendar-worker が書く。
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

	"github.com/Fukuemon/buddy/services/schedule/internal/audit"
	"github.com/Fukuemon/buddy/services/schedule/internal/config"
	"github.com/Fukuemon/buddy/services/schedule/internal/postgres"
)

const (
	shutdownTimeout = 30 * time.Second
	readyTimeout    = 2 * time.Second
)

func main() {
	if len(os.Args) > 1 && os.Args[1] == "healthcheck" {
		os.Exit(healthcheck.Run())
	}
	if err := run(); err != nil {
		slog.Error("api stopped", slog.Any("error", err))
		os.Exit(1)
	}
}

func run() error {
	cfg, err := config.LoadAPI(os.Getenv)
	if err != nil {
		return err
	}
	// 監査の記録とログを同じ相関 ID でつなぐため、リクエストのログの行に request_id を足す（ADR-0042）
	log := slog.New(audit.LogHandler(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: cfg.LogLevel}))).With(slog.String("component", "api"))

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	db, err := postgres.Open(ctx, postgres.Config(cfg.DB))
	if err != nil {
		return err
	}
	defer db.Close()

	verifier, err := oidc.NewVerifier(ctx, oidc.Config(cfg.OIDC), nil, log)
	if err != nil {
		return err
	}

	repos := newRepositories(db)
	accounts, err := openAccounts(ctx, cfg.Calendar, repos)
	if err != nil {
		return err
	}
	router := newHandler(repos, handlerConfig{
		API: cfg, Accounts: accounts, Verifier: verifier, Logger: log,
		Ready: func(ctx context.Context) error {
			ctx, cancel := context.WithTimeout(ctx, readyTimeout)
			defer cancel()
			return db.Ping(ctx)
		},
	})

	srv := &http.Server{
		Addr:              net.JoinHostPort("", cfg.Port),
		Handler:           router,
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
	}
	serveErr := make(chan error, 1)
	go func() {
		log.Info("listening", slog.String("addr", srv.Addr))
		serveErr <- srv.ListenAndServe()
	}()

	select {
	case err := <-serveErr:
		return err
	case <-ctx.Done():
	}
	log.Info("shutting down")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		return err
	}
	if err := <-serveErr; !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	return nil
}
