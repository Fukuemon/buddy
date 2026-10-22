package main

import (
	"log/slog"
	"slices"
	"testing"

	"github.com/Fukuemon/buddy/packages/go/gcalauth"

	"github.com/Fukuemon/buddy/services/receipt/internal/gcal"
)

func TestLoadConfig(t *testing.T) {
	env := func(m map[string]string) func(string) string {
		return func(k string) string {
			if v, ok := m[k]; ok {
				return v
			}
			return map[string]string{"OIDC_ISSUER": "http://idp/buddy", "OIDC_AUDIENCE": "receipt"}[k]
		}
	}
	cfg, err := loadConfig(env(nil))
	if err != nil || cfg.port != "8080" || cfg.maxUploadBytes != 10<<20 || cfg.logLevel != slog.LevelInfo || cfg.oidc.OrgClaim != "org_id" || cfg.allowOrigins != nil {
		t.Errorf("デフォルト値 = %+v, %v", cfg, err)
	}
	cfg, err = loadConfig(env(map[string]string{"PORT": "9000", "MAX_UPLOAD_BYTES": "2048", "LOG_LEVEL": "debug", "OIDC_ORG_CLAIM": "organization"}))
	if err != nil || cfg.port != "9000" || cfg.maxUploadBytes != 2048 || cfg.logLevel != slog.LevelDebug || cfg.oidc.OrgClaim != "organization" {
		t.Errorf("設定 = %+v, %v", cfg, err)
	}
	if cfg.oidc.Issuer != "http://idp/buddy" || cfg.oidc.Audience != "receipt" {
		t.Errorf("OIDC の設定 = %+v", cfg.oidc)
	}
	cfg, err = loadConfig(env(map[string]string{"CORS_ALLOW_ORIGINS": " http://a , ,http://b"}))
	if err != nil || !slices.Equal(cfg.allowOrigins, []string{"http://a", "http://b"}) {
		t.Errorf("CORS のオリジン = %q, %v", cfg.allowOrigins, err)
	}
	cfg, err = loadConfig(env(map[string]string{
		"GOOGLE_CALENDARS_FILE": "calendars.json", "GOOGLE_CALENDAR_SERVICE_ACCOUNTS_FILE": "accounts.json", "GOOGLE_CALENDAR_ENDPOINT": "http://localhost:9000/",
	}))
	if err != nil || cfg.calendarsFile != "calendars.json" || cfg.accountsFile != "accounts.json" || cfg.calendarEndpoint != "http://localhost:9000/" {
		t.Errorf("カレンダーの設定 = %+v, %v", cfg, err)
	}
	for _, bad := range []map[string]string{
		{"MAX_UPLOAD_BYTES": "0"}, {"MAX_UPLOAD_BYTES": "x"}, {"LOG_LEVEL": "loud"},
		{"GOOGLE_CALENDAR_ENDPOINT": "http://localhost:9000/"},
		{"GOOGLE_CALENDARS_FILE": "calendars.json"}, {"GOOGLE_CALENDAR_SERVICE_ACCOUNTS_FILE": "accounts.json"},
		{"OIDC_ISSUER": ""}, {"OIDC_AUDIENCE": ""},
	} {
		if _, err := loadConfig(env(bad)); err == nil {
			t.Errorf("%v でエラーにならない", bad)
		}
	}
}

func TestRequireAccounts(t *testing.T) {
	cals := []gcal.Calendar{{ID: "a@example.com", OrgID: "org-a"}, {ID: "b@example.com", OrgID: "org-b"}}
	if err := requireAccounts(cals, gcalauth.Accounts{"org-a": "a@example.iam.gserviceaccount.com", "org-b": "b@example.iam.gserviceaccount.com"}); err != nil {
		t.Errorf("全ての組織にある: %v", err)
	}
	if err := requireAccounts(cals, gcalauth.Accounts{"org-a": "a@example.iam.gserviceaccount.com"}); err == nil {
		t.Error("org-b のサービスアカウントが無いのにエラーにならない")
	}
}
