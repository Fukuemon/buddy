package config_test

import (
	"log/slog"
	"maps"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/config"
)

func env(m map[string]string) func(string) string {
	return func(k string) string { return m[k] }
}

func TestLoad(t *testing.T) {
	c, err := config.Load(env(map[string]string{
		"DB_USER": "app", "DB_PASSWORD": "secret", "DB_NAME": "buddy",
		"OIDC_ISSUER": "https://auth.example.com/realms/buddy", "OIDC_AUDIENCE": "schedule", "BROKER_URL": "http://broker:8080", "BROKER_TOKEN_URL": "http://hydra:4444/oauth2/token", "BROKER_CLIENT_SECRET": "broker-secret",
		"CORS_ALLOW_ORIGINS": "http://localhost:3000, http://localhost:5173", "LOG_LEVEL": "debug",
	}))
	if err != nil {
		t.Fatal(err)
	}
	if c.Port != "8080" || c.DB.Host != "localhost" || c.DB.Port != "5432" || c.LogLevel != slog.LevelDebug {
		t.Errorf("got %+v", c)
	}
	if c.OIDC.Issuer != "https://auth.example.com/realms/buddy" || c.OIDC.Audience != "schedule" || c.OIDC.OrgClaim != "org_id" {
		t.Errorf("OIDC = %+v", c.OIDC)
	}
	if c.Broker != (config.Broker{URL: "http://broker:8080", TokenURL: "http://hydra:4444/oauth2/token", ClientID: "schedule", ClientSecret: "broker-secret", Audience: "broker"}) {
		t.Errorf("Broker = %+v", c.Broker)
	}
	if !slices.Equal(c.AllowOrigins, []string{"http://localhost:3000", "http://localhost:5173"}) {
		t.Errorf("AllowOrigins = %v", c.AllowOrigins)
	}
	if c.Calendar != (config.Calendar{ExportInterval: 30 * time.Second, SyncInterval: 2 * time.Minute}) {
		t.Errorf("Calendar = %+v, want 設定なし", c.Calendar)
	}
}

func TestLoadAllVariables(t *testing.T) {
	c, err := config.Load(env(map[string]string{
		"PORT": "9090", "DB_HOST": "db", "DB_PORT": "15432", "DB_USER": "app", "DB_PASSWORD": "secret", "DB_NAME": "buddy",
		"OIDC_ISSUER": "http://idp:9000", "OIDC_AUDIENCE": "schedule", "OIDC_ORG_CLAIM": "organization",
		"CORS_ALLOW_ORIGINS": "http://localhost:3000", "LOG_LEVEL": "warn",
		"BROKER_URL": " http://broker:8080 ", "BROKER_TOKEN_URL": "http://hydra:4444/oauth2/token", "BROKER_CLIENT_ID": "schedule-api",
		"BROKER_CLIENT_SECRET": "broker-secret", "BROKER_AUDIENCE": "internal",
		"GOOGLE_CALENDAR_SERVICE_ACCOUNTS_FILE": "/config/accounts.json", "GOOGLE_CALENDAR_ENDPOINT": "http://gcalhold:8080/calendar/v3/",
		"GOOGLE_CALENDAR_EXPORT_ENABLED": "true", "GOOGLE_CALENDAR_EXPORT_INTERVAL": "5s",
		"GOOGLE_CALENDAR_SYNC_ENABLED": "true", "GOOGLE_CALENDAR_SYNC_INTERVAL": "1m",
	}))
	if err != nil {
		t.Fatal(err)
	}
	if c.Port != "9090" || c.DB != (config.DB{Host: "db", Port: "15432", User: "app", Password: "secret", Name: "buddy"}) {
		t.Errorf("Port = %q, DB = %+v", c.Port, c.DB)
	}
	if c.OIDC.Issuer != "http://idp:9000" || c.OIDC.Audience != "schedule" || c.OIDC.OrgClaim != "organization" {
		t.Errorf("OIDC = %+v", c.OIDC)
	}
	if !slices.Equal(c.AllowOrigins, []string{"http://localhost:3000"}) || c.LogLevel != slog.LevelWarn {
		t.Errorf("AllowOrigins = %v, LogLevel = %v", c.AllowOrigins, c.LogLevel)
	}
	if c.Broker != (config.Broker{URL: "http://broker:8080", TokenURL: "http://hydra:4444/oauth2/token", ClientID: "schedule-api", ClientSecret: "broker-secret", Audience: "internal"}) {
		t.Errorf("Broker = %+v", c.Broker)
	}
	if c.Calendar != (config.Calendar{
		ServiceAccountsFile: "/config/accounts.json", Endpoint: "http://gcalhold:8080/calendar/v3/",
		ExportEnabled: true, ExportInterval: 5 * time.Second, SyncEnabled: true, SyncInterval: time.Minute,
	}) {
		t.Errorf("Calendar = %+v", c.Calendar)
	}
}

func TestLoadCalendar(t *testing.T) {
	c, err := config.Load(env(map[string]string{
		"DB_USER": "app", "DB_PASSWORD": "secret", "DB_NAME": "buddy",
		"OIDC_ISSUER": "http://localhost:9000", "OIDC_AUDIENCE": "schedule", "BROKER_URL": "http://broker:8080", "BROKER_TOKEN_URL": "http://hydra:4444/oauth2/token", "BROKER_CLIENT_SECRET": "broker-secret",
		"GOOGLE_CALENDAR_SERVICE_ACCOUNTS_FILE": " /config/accounts.json ", "GOOGLE_CALENDAR_ENDPOINT": "http://gcalhold:8080/calendar/v3/",
	}))
	if err != nil {
		t.Fatal(err)
	}
	if c.Calendar != (config.Calendar{ServiceAccountsFile: "/config/accounts.json", Endpoint: "http://gcalhold:8080/calendar/v3/", ExportInterval: 30 * time.Second, SyncInterval: 2 * time.Minute}) {
		t.Errorf("Calendar = %+v", c.Calendar)
	}
}

func TestLoadErrors(t *testing.T) {
	base := map[string]string{
		"DB_USER": "app", "DB_PASSWORD": "secret", "DB_NAME": "buddy",
		"OIDC_ISSUER": "http://localhost:9000", "OIDC_AUDIENCE": "schedule", "BROKER_URL": "http://broker:8080", "BROKER_TOKEN_URL": "http://hydra:4444/oauth2/token", "BROKER_CLIENT_SECRET": "broker-secret",
	}
	tests := []struct {
		name string
		edit func(map[string]string)
		want string
	}{
		{name: "パスワードがない", edit: func(m map[string]string) { delete(m, "DB_PASSWORD") }, want: "DB_PASSWORD"},
		{name: "全部ない", edit: func(m map[string]string) { clear(m) }, want: "DB_USER, DB_PASSWORD, DB_NAME, OIDC_ISSUER, OIDC_AUDIENCE, BROKER_URL, BROKER_TOKEN_URL, BROKER_CLIENT_SECRET"},
		{name: "Issuer がない", edit: func(m map[string]string) { delete(m, "OIDC_ISSUER") }, want: "OIDC_ISSUER"},
		{name: "Issuer が URL でない", edit: func(m map[string]string) { m["OIDC_ISSUER"] = "auth.example.com" }, want: "OIDC_ISSUER"},
		{name: "ブローカーの client secret がない", edit: func(m map[string]string) { delete(m, "BROKER_CLIENT_SECRET") }, want: "BROKER_CLIENT_SECRET"},
		{name: "ブローカーの URL が URL でない", edit: func(m map[string]string) { m["BROKER_URL"] = "broker:8080" }, want: "BROKER_URL"},
		{name: "トークンのエンドポイントが URL でない", edit: func(m map[string]string) { m["BROKER_TOKEN_URL"] = "/oauth2/token" }, want: "BROKER_TOKEN_URL"},
		{name: "ポートが数でない", edit: func(m map[string]string) { m["PORT"] = "http" }, want: "ポート"},
		{name: "ログの水準", edit: func(m map[string]string) { m["LOG_LEVEL"] = "verbose" }, want: "LOG_LEVEL"},
		{name: "calendarpit の Calendar API だけ", edit: func(m map[string]string) { m["GOOGLE_CALENDAR_ENDPOINT"] = "http://gcalhold:8080/calendar/v3/" },
			want: "GOOGLE_CALENDAR_SERVICE_ACCOUNTS_FILE"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			m := maps.Clone(base)
			tt.edit(m)
			_, err := config.Load(env(m))
			if err == nil || !strings.Contains(err.Error(), tt.want) {
				t.Fatalf("err = %v, want %q を含む", err, tt.want)
			}
			if strings.Contains(err.Error(), "secret") {
				t.Error("エラーの文にパスワードか client secret が含まれる")
			}
		})
	}
}

func TestLoadOrgClaim(t *testing.T) {
	c, err := config.Load(env(map[string]string{
		"DB_USER": "app", "DB_PASSWORD": "secret", "DB_NAME": "buddy",
		"OIDC_ISSUER": "http://localhost:9000", "OIDC_AUDIENCE": "schedule", "BROKER_URL": "http://broker:8080", "BROKER_TOKEN_URL": "http://hydra:4444/oauth2/token", "BROKER_CLIENT_SECRET": "broker-secret", "OIDC_ORG_CLAIM": "organization",
	}))
	if err != nil {
		t.Fatal(err)
	}
	if c.OIDC.OrgClaim != "organization" {
		t.Errorf("OrgClaim = %q", c.OIDC.OrgClaim)
	}
}

func TestLoadDBDoesNotRequireOIDC(t *testing.T) {
	c, err := config.LoadDB(env(map[string]string{"DB_USER": "app", "DB_PASSWORD": "secret", "DB_NAME": "buddy"}))
	if err != nil {
		t.Fatal(err)
	}
	if c.User != "app" || c.Host != "localhost" {
		t.Errorf("got %+v", c)
	}
	if _, err := config.LoadDB(env(map[string]string{"DB_USER": "app"})); err == nil || !strings.Contains(err.Error(), "DB_PASSWORD") {
		t.Errorf("err = %v", err)
	}
}

func TestLoadExportInterval(t *testing.T) {
	base := map[string]string{
		"DB_USER": "u", "DB_PASSWORD": "p", "DB_NAME": "n", "OIDC_ISSUER": "http://idp", "OIDC_AUDIENCE": "a", "BROKER_URL": "http://broker:8080", "BROKER_TOKEN_URL": "http://hydra:4444/oauth2/token", "BROKER_CLIENT_SECRET": "broker-secret",
	}
	getenv := func(extra map[string]string) func(string) string {
		return func(k string) string {
			if v, ok := extra[k]; ok {
				return v
			}
			return base[k]
		}
	}
	c, err := config.Load(getenv(nil))
	if err != nil || c.Calendar.ExportInterval != 30*time.Second {
		t.Fatalf("デフォルトの間隔 = %v, %v", c.Calendar.ExportInterval, err)
	}
	c, err = config.Load(getenv(map[string]string{"GOOGLE_CALENDAR_EXPORT_INTERVAL": "2s"}))
	if err != nil || c.Calendar.ExportInterval != 2*time.Second {
		t.Errorf("2s = %v, %v", c.Calendar.ExportInterval, err)
	}
	c, err = config.Load(getenv(map[string]string{"GOOGLE_CALENDAR_EXPORT_ENABLED": "true", "GOOGLE_CALENDAR_SERVICE_ACCOUNTS_FILE": "/config/accounts.json"}))
	if err != nil || !c.Calendar.ExportEnabled {
		t.Errorf("書き出しを有効にする = %v, %v", c.Calendar.ExportEnabled, err)
	}
	if c.Calendar.SyncEnabled || c.Calendar.SyncInterval != 2*time.Minute {
		t.Errorf("デフォルトの同期 = %v, %v", c.Calendar.SyncEnabled, c.Calendar.SyncInterval)
	}
	c, err = config.Load(getenv(map[string]string{
		"GOOGLE_CALENDAR_EXPORT_ENABLED": "true", "GOOGLE_CALENDAR_SYNC_ENABLED": "true", "GOOGLE_CALENDAR_SYNC_INTERVAL": "3m",
		"GOOGLE_CALENDAR_SERVICE_ACCOUNTS_FILE": "/config/accounts.json",
	}))
	if err != nil || !c.Calendar.SyncEnabled || c.Calendar.SyncInterval != 3*time.Minute {
		t.Errorf("同期を有効にする = %v, %v, %v", c.Calendar.SyncEnabled, c.Calendar.SyncInterval, err)
	}
	for _, extra := range []map[string]string{
		{"GOOGLE_CALENDAR_EXPORT_ENABLED": "true"},
		{"GOOGLE_CALENDAR_EXPORT_ENABLED": "yes", "GOOGLE_CALENDAR_SERVICE_ACCOUNTS_FILE": "/config/accounts.json"},
		{"GOOGLE_CALENDAR_SYNC_ENABLED": "true", "GOOGLE_CALENDAR_SERVICE_ACCOUNTS_FILE": "/config/accounts.json"},
		{"GOOGLE_CALENDAR_SYNC_INTERVAL": "500ms"},
	} {
		if _, err := config.Load(getenv(extra)); err == nil {
			t.Errorf("%v を受けた", extra)
		}
	}
	for _, v := range []string{"500ms", "soon"} {
		if _, err := config.Load(getenv(map[string]string{"GOOGLE_CALENDAR_EXPORT_INTERVAL": v})); err == nil {
			t.Errorf("%s を受けた", v)
		}
	}
}
