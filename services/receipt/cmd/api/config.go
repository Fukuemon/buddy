package main

import (
	"errors"
	"fmt"
	"log/slog"
	"strconv"
	"strings"

	"github.com/Fukuemon/buddy/packages/go/oidc"
)

type config struct {
	port             string
	maxUploadBytes   int64
	logLevel         slog.Level
	calendarsFile    string
	accountsFile     string
	calendarEndpoint string
	scheduleURL      string
	oidc             oidc.Config
	allowOrigins     []string
}

func loadConfig(getenv func(string) string) (config, error) {
	cfg := config{port: "8080", maxUploadBytes: 10 << 20, logLevel: slog.LevelInfo}
	cfg.oidc = oidc.Config{Issuer: getenv("OIDC_ISSUER"), Audience: getenv("OIDC_AUDIENCE"), OrgClaim: getenv("OIDC_ORG_CLAIM")}
	var missingNames []string
	if cfg.oidc.Issuer == "" {
		missingNames = append(missingNames, "OIDC_ISSUER")
	}
	if cfg.oidc.Audience == "" {
		missingNames = append(missingNames, "OIDC_AUDIENCE")
	}
	cfg.scheduleURL = getenv("SCHEDULE_URL")
	if cfg.scheduleURL == "" {
		missingNames = append(missingNames, "SCHEDULE_URL")
	}
	if len(missingNames) > 0 {
		return config{}, fmt.Errorf("環境変数 %s が必要である", strings.Join(missingNames, "、"))
	}
	if cfg.oidc.OrgClaim == "" {
		cfg.oidc.OrgClaim = "org_id"
	}
	if v := strings.TrimSpace(getenv("PORT")); v != "" {
		cfg.port = v
	}
	if n, err := strconv.Atoi(cfg.port); err != nil || n < 1 || n > 65535 {
		return config{}, fmt.Errorf("ポート %q は 1 から 65535 の数にする", cfg.port)
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
	cfg.calendarsFile = strings.TrimSpace(getenv("GOOGLE_CALENDARS_FILE"))
	cfg.accountsFile = strings.TrimSpace(getenv("GOOGLE_CALENDAR_SERVICE_ACCOUNTS_FILE"))
	cfg.calendarEndpoint = strings.TrimSpace(getenv("GOOGLE_CALENDAR_ENDPOINT"))
	if cfg.calendarEndpoint != "" && cfg.calendarsFile == "" {
		return config{}, errors.New("GOOGLE_CALENDAR_ENDPOINT は GOOGLE_CALENDARS_FILE と一緒に渡す")
	}
	if (cfg.calendarsFile == "") != (cfg.accountsFile == "") {
		return config{}, errors.New("GOOGLE_CALENDARS_FILE と GOOGLE_CALENDAR_SERVICE_ACCOUNTS_FILE は一緒に渡す")
	}
	return cfg, nil
}
