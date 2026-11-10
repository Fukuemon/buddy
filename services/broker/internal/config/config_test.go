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
		"TOKEN_HOOK_KEY":                   "hook-key-0123456789abcdef0123456789",
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
	m["INTERNAL_PORT"] = "9090"
	m["INTERNAL_API_CLIENTS"] = "schedule, receipt"
	// シークレットのファイルの末尾の改行は除く
	m["TOKEN_HOOK_KEY"] = "hook-key-0123456789abcdef0123456789\n"
	c, err := config.Load(env(m))
	if err != nil {
		t.Fatal(err)
	}
	want := config.Config{
		Port:                         "8080",
		InternalPort:                 "9090",
		LogLevel:                     slog.LevelDebug,
		DB:                           config.DB{Host: "localhost", Port: "5432", User: "broker", Password: "secret", Name: "broker"},
		HydraAdminURL:                "http://hydra:4445",
		UpstreamIdPsFile:             "/config/upstream-idps.json",
		UpstreamClientSecretsFile:    "/secrets/upstream-idp-client-secrets.json",
		PublicURL:                    "https://login.example.com",
		UpstreamBrowserOrigin:        "http://localhost:9000",
		ClientIPHeader:               "X-Forwarded-For",
		AutoConsentClients:           []string{"web", "admin"},
		HydraIssuer:                  "http://hydra:4444",
		InternalAPIAudience:          "broker",
		InternalAPIClients:           []string{"schedule", "receipt"},
		InternalAPIOnboardingClients: []string{"schedule-ops"},
		TokenHookKey:                 "hook-key-0123456789abcdef0123456789",
	}
	if !reflect.DeepEqual(c, want) {
		t.Errorf("got %+v, want %+v", c, want)
	}
}

func TestLoadDefaults(t *testing.T) {
	c, err := config.Load(env(baseEnv()))
	if err != nil {
		t.Fatal(err)
	}
	if !slices.Equal(c.AutoConsentClients, []string{"web"}) || c.ClientIPHeader != "" {
		t.Errorf("AutoConsentClients = %v, ClientIPHeader = %q", c.AutoConsentClients, c.ClientIPHeader)
	}
	if c.InternalPort != "8081" || !slices.Equal(c.InternalAPIClients, []string{"schedule"}) || !slices.Equal(c.InternalAPIOnboardingClients, []string{"schedule-ops"}) {
		t.Errorf("InternalPort = %q, InternalAPIClients = %v, InternalAPIOnboardingClients = %v", c.InternalPort, c.InternalAPIClients, c.InternalAPIOnboardingClients)
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
		{"内部のポートが数でない", map[string]string{"INTERNAL_PORT": "x"}, "ポート"},
		{"内部のポートが画面のポートと同じ", map[string]string{"PORT": "8081"}, "INTERNAL_PORT"},
		{"DB のポートが範囲の外", map[string]string{"DB_PORT": "70000"}, "ポート"},
		{"HYDRA_ADMIN_URL が URL でない", map[string]string{"HYDRA_ADMIN_URL": "hydra:4445"}, "HYDRA_ADMIN_URL"},
		{"HYDRA_ISSUER が URL でない", map[string]string{"HYDRA_ISSUER": "hydra"}, "HYDRA_ISSUER"},
		{"PUBLIC_URL が URL でない", map[string]string{"PUBLIC_URL": "/login"}, "PUBLIC_URL"},
		{"UPSTREAM_IDP_BROWSER_ORIGIN が URL でない", map[string]string{"UPSTREAM_IDP_BROWSER_ORIGIN": "localhost:9000"}, "UPSTREAM_IDP_BROWSER_ORIGIN"},
		{"LOG_LEVEL が不正", map[string]string{"LOG_LEVEL": "verbose"}, "LOG_LEVEL"},
		{"TOKEN_HOOK_KEY が 31 バイト", map[string]string{"TOKEN_HOOK_KEY": "0123456789012345678901234567890"}, "TOKEN_HOOK_KEY"},
		{"運営用のクライアントが内部の API の全ての操作を呼べるクライアントと重なる", map[string]string{"INTERNAL_API_ONBOARDING_CLIENTS": "schedule"}, "INTERNAL_API_ONBOARDING_CLIENTS"},
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
