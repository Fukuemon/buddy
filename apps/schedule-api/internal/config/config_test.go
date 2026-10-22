package config_test

import (
	"log/slog"
	"maps"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/Fukuemon/buddy/apps/schedule-api/internal/config"
)

func env(m map[string]string) func(string) string {
	return func(k string) string { return m[k] }
}

func TestLoad(t *testing.T) {
	c, err := config.Load(env(map[string]string{
		"DB_USER": "app", "DB_PASSWORD": "secret", "DB_NAME": "buddy",
		"OIDC_ISSUER": "https://auth.example.com/realms/buddy", "OIDC_AUDIENCE": "schedule-api",
		"CORS_ALLOW_ORIGINS": "http://localhost:3000, http://localhost:5173", "LOG_LEVEL": "debug",
	}))
	if err != nil {
		t.Fatal(err)
	}
	if c.Port != "8080" || c.DB.Host != "localhost" || c.DB.Port != "5432" || c.LogLevel != slog.LevelDebug {
		t.Errorf("got %+v", c)
	}
	if c.OIDC.Issuer != "https://auth.example.com/realms/buddy" || c.OIDC.Audience != "schedule-api" || c.OIDC.OrgClaim != "org_id" {
		t.Errorf("OIDC = %+v", c.OIDC)
	}
	if !slices.Equal(c.AllowOrigins, []string{"http://localhost:3000", "http://localhost:5173"}) {
		t.Errorf("AllowOrigins = %v", c.AllowOrigins)
	}
	if c.Calendar != (config.Calendar{ExportInterval: 30 * time.Second, SyncInterval: 2 * time.Minute}) {
		t.Errorf("Calendar = %+v, want 設定なし", c.Calendar)
	}
}

func TestLoadCalendar(t *testing.T) {
	c, err := config.Load(env(map[string]string{
		"DB_USER": "app", "DB_PASSWORD": "secret", "DB_NAME": "buddy",
		"OIDC_ISSUER": "http://localhost:9000", "OIDC_AUDIENCE": "schedule-api",
		"GOOGLE_CALENDAR_SERVICE_ACCOUNT": " buddy@example.iam.gserviceaccount.com ", "GOOGLE_CALENDAR_ENDPOINT": "http://fake-google:8080/",
	}))
	if err != nil {
		t.Fatal(err)
	}
	if c.Calendar != (config.Calendar{ServiceAccount: "buddy@example.iam.gserviceaccount.com", Endpoint: "http://fake-google:8080/", ExportInterval: 30 * time.Second, SyncInterval: 2 * time.Minute}) {
		t.Errorf("Calendar = %+v", c.Calendar)
	}
}

func TestLoadErrors(t *testing.T) {
	base := map[string]string{
		"DB_USER": "app", "DB_PASSWORD": "secret", "DB_NAME": "buddy",
		"OIDC_ISSUER": "http://localhost:9000", "OIDC_AUDIENCE": "schedule-api",
	}
	tests := []struct {
		name string
		edit func(map[string]string)
		want string
	}{
		{name: "パスワードがない", edit: func(m map[string]string) { delete(m, "DB_PASSWORD") }, want: "DB_PASSWORD"},
		{name: "全部ない", edit: func(m map[string]string) { clear(m) }, want: "DB_USER, DB_PASSWORD, DB_NAME, OIDC_ISSUER, OIDC_AUDIENCE"},
		{name: "Issuer がない", edit: func(m map[string]string) { delete(m, "OIDC_ISSUER") }, want: "OIDC_ISSUER"},
		{name: "Issuer が URL でない", edit: func(m map[string]string) { m["OIDC_ISSUER"] = "auth.example.com" }, want: "OIDC_ISSUER"},
		{name: "ポートが数でない", edit: func(m map[string]string) { m["PORT"] = "http" }, want: "ポート"},
		{name: "ログの水準", edit: func(m map[string]string) { m["LOG_LEVEL"] = "verbose" }, want: "LOG_LEVEL"},
		{name: "フェイクの Calendar API だけ", edit: func(m map[string]string) { m["GOOGLE_CALENDAR_ENDPOINT"] = "http://fake-google:8080/" },
			want: "GOOGLE_CALENDAR_SERVICE_ACCOUNT"},
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
				t.Error("エラーの文にパスワードが含まれる")
			}
		})
	}
}

func TestLoadOrgClaim(t *testing.T) {
	c, err := config.Load(env(map[string]string{
		"DB_USER": "app", "DB_PASSWORD": "secret", "DB_NAME": "buddy",
		"OIDC_ISSUER": "http://localhost:9000", "OIDC_AUDIENCE": "schedule-api", "OIDC_ORG_CLAIM": "organization",
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
		"DB_USER": "u", "DB_PASSWORD": "p", "DB_NAME": "n", "OIDC_ISSUER": "http://idp", "OIDC_AUDIENCE": "a",
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
	c, err = config.Load(getenv(map[string]string{"GOOGLE_CALENDAR_EXPORT_ENABLED": "true", "GOOGLE_CALENDAR_SERVICE_ACCOUNT": "sa@example.com"}))
	if err != nil || !c.Calendar.ExportEnabled {
		t.Errorf("書き出しを有効にする = %v, %v", c.Calendar.ExportEnabled, err)
	}
	if c.Calendar.SyncEnabled || c.Calendar.SyncInterval != 2*time.Minute {
		t.Errorf("デフォルトの同期 = %v, %v", c.Calendar.SyncEnabled, c.Calendar.SyncInterval)
	}
	c, err = config.Load(getenv(map[string]string{
		"GOOGLE_CALENDAR_EXPORT_ENABLED": "true", "GOOGLE_CALENDAR_SYNC_ENABLED": "true", "GOOGLE_CALENDAR_SYNC_INTERVAL": "3m",
		"GOOGLE_CALENDAR_SERVICE_ACCOUNT": "sa@example.com",
	}))
	if err != nil || !c.Calendar.SyncEnabled || c.Calendar.SyncInterval != 3*time.Minute {
		t.Errorf("同期を有効にする = %v, %v, %v", c.Calendar.SyncEnabled, c.Calendar.SyncInterval, err)
	}
	for _, extra := range []map[string]string{
		{"GOOGLE_CALENDAR_EXPORT_ENABLED": "true"},
		{"GOOGLE_CALENDAR_EXPORT_ENABLED": "yes", "GOOGLE_CALENDAR_SERVICE_ACCOUNT": "sa@example.com"},
		{"GOOGLE_CALENDAR_SYNC_ENABLED": "true", "GOOGLE_CALENDAR_SERVICE_ACCOUNT": "sa@example.com"},
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
