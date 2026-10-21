package config_test

import (
	"log/slog"
	"maps"
	"slices"
	"strings"
	"testing"

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
	if c.Calendar != (config.Calendar{}) {
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
	if c.Calendar != (config.Calendar{ServiceAccount: "buddy@example.iam.gserviceaccount.com", Endpoint: "http://fake-google:8080/"}) {
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
		{name: "発行者がない", edit: func(m map[string]string) { delete(m, "OIDC_ISSUER") }, want: "OIDC_ISSUER"},
		{name: "発行者が URL でない", edit: func(m map[string]string) { m["OIDC_ISSUER"] = "auth.example.com" }, want: "OIDC_ISSUER"},
		{name: "ポートが数でない", edit: func(m map[string]string) { m["PORT"] = "http" }, want: "ポート"},
		{name: "ログの水準", edit: func(m map[string]string) { m["LOG_LEVEL"] = "verbose" }, want: "LOG_LEVEL"},
		{name: "偽物の Calendar API だけ", edit: func(m map[string]string) { m["GOOGLE_CALENDAR_ENDPOINT"] = "http://fake-google:8080/" },
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
