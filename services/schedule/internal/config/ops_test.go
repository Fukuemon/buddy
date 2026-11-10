package config_test

import (
	"log/slog"
	"strings"
	"testing"

	"github.com/Fukuemon/buddy/services/schedule/internal/config"
)

func TestLoadOps(t *testing.T) {
	c, err := config.LoadOps(env(map[string]string{
		"DB_USER": "app", "DB_PASSWORD": "secret", "DB_NAME": "buddy",
		"BROKER_URL": "http://broker:8081", "BROKER_TOKEN_URL": "http://hydra:4444/oauth2/token", "BROKER_CLIENT_SECRET": "ops-secret",
		"OIDC_ISSUER": "", "PORT": "http",
	}))
	if err != nil {
		t.Fatal(err)
	}
	want := config.Ops{
		DB:       config.DB{Host: "localhost", Port: "5432", User: "app", Password: "secret", Name: "buddy"},
		LogLevel: slog.LevelInfo,
		Broker: config.Broker{
			URL: "http://broker:8081", TokenURL: "http://hydra:4444/oauth2/token",
			ClientID: "schedule-ops", ClientSecret: "ops-secret", Audience: "broker",
		},
	}
	if c != want {
		t.Errorf("got %+v, want %+v", c, want)
	}
}

func TestLoadOpsErrors(t *testing.T) {
	base := func() map[string]string {
		return map[string]string{
			"DB_USER": "app", "DB_PASSWORD": "secret", "DB_NAME": "buddy",
			"BROKER_URL": "http://broker:8081", "BROKER_TOKEN_URL": "http://hydra:4444/oauth2/token", "BROKER_CLIENT_SECRET": "ops-secret",
		}
	}
	tests := []struct {
		name string
		edit func(map[string]string)
		want string
	}{
		{"client secret が無い", func(m map[string]string) { delete(m, "BROKER_CLIENT_SECRET") }, "BROKER_CLIENT_SECRET"},
		{"ブローカーの URL が URL でない", func(m map[string]string) { m["BROKER_URL"] = "broker" }, "BROKER_URL"},
		{"DB のポートが数でない", func(m map[string]string) { m["DB_PORT"] = "db" }, "ポート"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			m := base()
			tt.edit(m)
			_, err := config.LoadOps(env(m))
			if err == nil || !strings.Contains(err.Error(), tt.want) {
				t.Errorf("err = %v, want %q を含むエラー", err, tt.want)
			}
		})
	}
}
