// Command api は、照合の HTTP の API のサーバーを起動する。
//
// 環境変数:
//
//   - PORT: 待ち受けるポート。既定は 8080。
//   - MAX_UPLOAD_BYTES: POST /v1/checks の本文の上限のバイト数。既定は 10485760（10 MiB）。
//   - LOG_LEVEL: debug、info、warn、error のいずれか。既定は info。
//
// SIGINT か SIGTERM を受けると、処理中の要求を待ってから終了する。設定の誤りと起動の失敗では終了コード 1 で終わる。
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
	"syscall"
	"time"

	"github.com/Fukuemon/buddy/apps/receipt-api/internal/httpapi"
)

type config struct {
	port           string
	maxUploadBytes int64
	logLevel       slog.Level
}

func loadConfig(getenv func(string) string) (config, error) {
	cfg := config{port: "8080", maxUploadBytes: 10 << 20, logLevel: slog.LevelInfo}
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
	return cfg, nil
}

func main() {
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

	srv := &http.Server{
		Addr:              ":" + cfg.port,
		Handler:           httpapi.NewHandler(logger, httpapi.Config{MaxUploadBytes: cfg.maxUploadBytes}),
		ReadHeaderTimeout: 10 * time.Second,
		ErrorLog:          slog.NewLogLogger(logger.Handler(), slog.LevelError),
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

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
