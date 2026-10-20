// Command api は、照合の HTTP の API のサーバーを起動する。
//
// 環境変数:
//
//   - PORT: 待ち受けるポート。既定は 8080。
//   - MAX_UPLOAD_BYTES: POST /v1/checks の本文の上限のバイト数。既定は 10485760（10 MiB）。
//   - LOG_LEVEL: debug、info、warn、error のいずれか。既定は info。
//   - GOOGLE_CALENDARS_FILE: 照合の対象のカレンダーの設定（JSON）のパス。空なら Google カレンダーを使わない。
//     形は gcal.LoadCalendars にある。認証は Application Default Credentials で読む。
//   - GOOGLE_CALENDAR_ENDPOINT: Calendar API の代わりに呼ぶ URL。偽物の API で試すためのもので、認証をしない。
//
// `api healthcheck` は、サーバーを起動せず、動いているサーバーの GET /readyz を確かめて終わる。
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

	"golang.org/x/oauth2/google"
	"google.golang.org/api/calendar/v3"
	"google.golang.org/api/option"

	"github.com/Fukuemon/buddy/apps/receipt-api/internal/gcal"
	"github.com/Fukuemon/buddy/apps/receipt-api/internal/httpapi"
	"github.com/Fukuemon/buddy/apps/receipt-api/internal/source"
)

type config struct {
	port             string
	maxUploadBytes   int64
	logLevel         slog.Level
	calendarsFile    string
	calendarEndpoint string
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
	cfg.calendarsFile = getenv("GOOGLE_CALENDARS_FILE")
	cfg.calendarEndpoint = getenv("GOOGLE_CALENDAR_ENDPOINT")
	if cfg.calendarEndpoint != "" && cfg.calendarsFile == "" {
		return config{}, errors.New("GOOGLE_CALENDAR_ENDPOINT は GOOGLE_CALENDARS_FILE と一緒に渡す")
	}
	return cfg, nil
}

// newCalendarReader は、cfg.calendarsFile のカレンダーを読む gcal.Reader を返す。設定が無ければ nil を返す。
func newCalendarReader(ctx context.Context, cfg config) (*gcal.Reader, error) {
	if cfg.calendarsFile == "" {
		return nil, nil
	}
	cals, err := gcal.LoadCalendars(cfg.calendarsFile)
	if err != nil {
		return nil, err
	}
	var opts []option.ClientOption
	if cfg.calendarEndpoint != "" {
		opts = append(opts, option.WithEndpoint(cfg.calendarEndpoint), option.WithoutAuthentication())
	} else {
		creds, err := google.FindDefaultCredentials(ctx, calendar.CalendarReadonlyScope)
		if err != nil {
			return nil, fmt.Errorf("application default credentials を読めない: %w", err)
		}
		opts = append(opts, option.WithCredentials(creds))
	}
	svc, err := calendar.NewService(ctx, opts...)
	if err != nil {
		return nil, err
	}
	return gcal.NewReader(svc, cals), nil
}

func main() {
	if len(os.Args) > 1 && os.Args[1] == "healthcheck" {
		os.Exit(healthcheck())
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

	reader, err := newCalendarReader(context.Background(), cfg)
	if err != nil {
		return err
	}
	logger.Info("Google カレンダーの取得元の設定を読んだ", "enabled", reader != nil)

	srv := &http.Server{
		Addr: ":" + cfg.port,
		Handler: httpapi.NewHandler(logger, httpapi.Config{
			MaxUploadBytes: cfg.maxUploadBytes,
			Sources:        source.Selector{Calendar: reader},
		}),
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
