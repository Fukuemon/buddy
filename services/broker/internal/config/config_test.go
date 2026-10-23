package config_test

import (
	"log/slog"
	"maps"
	"reflect"
	"slices"
	"strings"
	"testing"

	"github.com/Fukuemon/buddy/services/broker/internal/config"
)

func env(m map[string]string) func(string) string {
	return func(k string) string { return m[k] }
}

func baseEnv() map[string]string {
	return map[string]string{
		"DB_USER": "broker", "DB_PASSWORD": "secret", "DB_NAME": "broker",
		"HYDRA_ADMIN_URL":                  "http://hydra:4445",
		"UPSTREAM_IDPS_FILE":               "/config/upstream-idps.json",
		"UPSTREAM_IDP_CLIENT_SECRETS_FILE": "/secrets/upstream-idp-client-secrets.json",
		"PUBLIC_URL":                       "https://login.example.com",
		"HYDRA_ISSUER":                     "http://hydra:4444",
		"TOKEN_HOOK_KEY":                   "hook-key",
	}
}

func TestLoad(t *testing.T) {
	m := baseEnv()
	m["LOG_LEVEL"] = "debug"
	m["UPSTREAM_IDPS_FILE"] = " /config/upstream-idps.json "
	m["PUBLIC_URL"] = "https://login.example.com/"
	m["UPSTREAM_IDP_BROWSER_ORIGIN"] = "http://localhost:9000"
	m["CLIENT_IP_HEADER"] = "X-Forwarded-For"
	m["AUTO_CONSENT_CLIENTS"] = "web, admin,"
	c, err := config.Load(env(m))
	if err != nil {
		t.Fatal(err)
	}
	want := config.Config{
		Port:                      "8080",
		LogLevel:                  slog.LevelDebug,
		DB:                        config.DB{Host: "localhost", Port: "5432", User: "broker", Password: "secret", Name: "broker"},
		HydraAdminURL:             "http://hydra:4445",
		UpstreamIdPsFile:          "/config/upstream-idps.json",
		UpstreamClientSecretsFile: "/secrets/upstream-idp-client-secrets.json",
		PublicURL:                 "https://login.example.com",
		UpstreamBrowserOrigin:     "http://localhost:9000",
		ClientIPHeader:            "X-Forwarded-For",
		AutoConsentClients:        []string{"web", "admin"},
		HydraIssuer:               "http://hydra:4444",
		InternalAPIAudience:       "broker",
		TokenHookKey:              "hook-key",
	}
	if !reflect.DeepEqual(c, want) {
		t.Errorf("got %+v, want %+v", c, want)
	}
}

func TestLoadDefaultAutoConsentClients(t *testing.T) {
	c, err := config.Load(env(baseEnv()))
	if err != nil {
		t.Fatal(err)
	}
	if !slices.Equal(c.AutoConsentClients, []string{"web"}) || c.ClientIPHeader != "" {
		t.Errorf("AutoConsentClients = %v, ClientIPHeader = %q", c.AutoConsentClients, c.ClientIPHeader)
	}
}

func TestLoadDB(t *testing.T) {
	db, err := config.LoadDB(env(map[string]string{"DB_HOST": "db", "DB_USER": "broker", "DB_PASSWORD": "secret", "DB_NAME": "broker"}))
	if err != nil {
		t.Fatal(err)
	}
	if db != (config.DB{Host: "db", Port: "5432", User: "broker", Password: "secret", Name: "broker"}) {
		t.Errorf("got %+v", db)
	}
}

func TestLoadErrors(t *testing.T) {
	tests := []struct {
		name string
		set  map[string]string
		want string
	}{
		{"必須の値が無い", map[string]string{"DB_PASSWORD": "", "HYDRA_ADMIN_URL": " ", "HYDRA_ISSUER": "", "UPSTREAM_IDPS_FILE": "", "UPSTREAM_IDP_CLIENT_SECRETS_FILE": "", "PUBLIC_URL": "", "TOKEN_HOOK_KEY": ""},
			"DB_PASSWORD、HYDRA_ADMIN_URL、HYDRA_ISSUER、UPSTREAM_IDPS_FILE、UPSTREAM_IDP_CLIENT_SECRETS_FILE、PUBLIC_URL、TOKEN_HOOK_KEY"},
		{"ポートが数でない", map[string]string{"PORT": "http"}, "ポート"},
		{"DB のポートが範囲の外", map[string]string{"DB_PORT": "70000"}, "ポート"},
		{"HYDRA_ADMIN_URL が URL でない", map[string]string{"HYDRA_ADMIN_URL": "hydra:4445"}, "HYDRA_ADMIN_URL"},
		{"HYDRA_ISSUER が URL でない", map[string]string{"HYDRA_ISSUER": "hydra"}, "HYDRA_ISSUER"},
		{"PUBLIC_URL が URL でない", map[string]string{"PUBLIC_URL": "/login"}, "PUBLIC_URL"},
		{"UPSTREAM_IDP_BROWSER_ORIGIN が URL でない", map[string]string{"UPSTREAM_IDP_BROWSER_ORIGIN": "localhost:9000"}, "UPSTREAM_IDP_BROWSER_ORIGIN"},
		{"LOG_LEVEL が不正", map[string]string{"LOG_LEVEL": "verbose"}, "LOG_LEVEL"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			m := baseEnv()
			maps.Copy(m, tt.set)
			_, err := config.Load(env(m))
			if err == nil || !strings.Contains(err.Error(), tt.want) {
				t.Errorf("err = %v, want %q を含むエラー", err, tt.want)
			}
		})
	}
}
