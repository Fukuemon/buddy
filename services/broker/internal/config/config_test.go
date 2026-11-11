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
		"LOGIN_COOKIE_KEYS":                "cookie-key-0123456789abcdef012345678",
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
	m["DB_MAX_CONNS"] = " 3 "
	// シークレットのファイルの末尾の改行は除く
	m["TOKEN_HOOK_KEY"] = "hook-key-0123456789abcdef0123456789\n"
	m["LOGIN_COOKIE_KEYS"] = "cookie-key-new-0123456789abcdef01234, cookie-key-old-0123456789abcdef01234\n"
	c, err := config.Load(env(m))
	if err != nil {
		t.Fatal(err)
	}
	want := config.Config{
		Port:                         "8080",
		InternalPort:                 "9090",
		ListenTarget:                 config.ListenBoth,
		LogLevel:                     slog.LevelDebug,
		DB:                           config.DB{Host: "localhost", Port: "5432", User: "broker", Password: "secret", Name: "broker", MaxConns: 3},
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
		LoginCookieKeys:              []string{"cookie-key-new-0123456789abcdef01234", "cookie-key-old-0123456789abcdef01234"},
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
	if c.ListenTarget != config.ListenBoth {
		t.Errorf("ListenTarget = %q, want both", c.ListenTarget)
	}
	// 0 は、postgres.Open が接続のプールの上限をデフォルトの数にする値である
	if c.DB.MaxConns != 0 {
		t.Errorf("DB.MaxConns = %d, want 0", c.DB.MaxConns)
	}
	if c.InternalPort != "8081" || !slices.Equal(c.InternalAPIClients, []string{"schedule"}) || !slices.Equal(c.InternalAPIOnboardingClients, []string{"schedule-ops"}) {
		t.Errorf("InternalPort = %q, InternalAPIClients = %v, InternalAPIOnboardingClients = %v", c.InternalPort, c.InternalAPIClients, c.InternalAPIOnboardingClients)
	}
}

func TestLoadDB(t *testing.T) {
	// マイグレーションは INTERNAL_PORT を使わないので、値を確認しない
	db, err := config.LoadDB(env(map[string]string{"INTERNAL_PORT": "x", "DB_HOST": "db", "DB_USER": "broker", "DB_PASSWORD": "secret", "DB_NAME": "broker", "DB_MAX_CONNS": "3"}))
	if err != nil {
		t.Fatal(err)
	}
	if db != (config.DB{Host: "db", Port: "5432", User: "broker", Password: "secret", Name: "broker", MaxConns: 3}) {
		t.Errorf("got %+v", db)
	}
}

// マイグレーションも、予定の API の LoadDB と同じく、1 以上の数でない DB_MAX_CONNS を拒む。
func TestLoadDBRejectsInvalidMaxConns(t *testing.T) {
	_, err := config.LoadDB(env(map[string]string{"DB_USER": "broker", "DB_PASSWORD": "secret", "DB_NAME": "broker", "DB_MAX_CONNS": "0"}))
	if err == nil || !strings.Contains(err.Error(), "DB_MAX_CONNS") {
		t.Errorf("err = %v, want DB_MAX_CONNS のエラー", err)
	}
}

// public と internal は INTERNAL_PORT を使わないので、PORT と同じ値や数でない値でも起動する。
// Cloud Run が PORT に入れる値が、使わない INTERNAL_PORT のデフォルトと重なっても拒まない。
func TestLoadSingleTarget(t *testing.T) {
	for _, target := range []string{"public", "internal"} {
		for _, internalPort := range []string{"", "8081", "x"} {
			t.Run(target+"/INTERNAL_PORT="+internalPort, func(t *testing.T) {
				m := baseEnv()
				m["LISTEN_TARGET"] = target
				m["PORT"] = "8081"
				m["INTERNAL_PORT"] = internalPort
				c, err := config.Load(env(m))
				if err != nil {
					t.Fatal(err)
				}
				if c.ListenTarget != config.ListenTarget(target) || c.Port != "8081" {
					t.Errorf("ListenTarget = %q, Port = %q", c.ListenTarget, c.Port)
				}
			})
		}
	}
}

func TestLoadErrors(t *testing.T) {
	tests := []struct {
		name string
		set  map[string]string
		want string
	}{
		{"必須の値が無い", map[string]string{"DB_PASSWORD": "", "HYDRA_ADMIN_URL": " ", "HYDRA_ISSUER": "", "UPSTREAM_IDPS_FILE": "", "UPSTREAM_IDP_CLIENT_SECRETS_FILE": "", "PUBLIC_URL": "", "TOKEN_HOOK_KEY": "", "LOGIN_COOKIE_KEYS": ""},
			"DB_PASSWORD、HYDRA_ADMIN_URL、HYDRA_ISSUER、UPSTREAM_IDPS_FILE、UPSTREAM_IDP_CLIENT_SECRETS_FILE、PUBLIC_URL、TOKEN_HOOK_KEY、LOGIN_COOKIE_KEYS"},
		{"ポートが数でない", map[string]string{"PORT": "http"}, "ポート"},
		{"内部のポートが数でない", map[string]string{"INTERNAL_PORT": "x"}, "ポート"},
		{"内部のポートが画面のポートと同じ", map[string]string{"PORT": "8081"}, "INTERNAL_PORT"},
		{"LISTEN_TARGET が不正", map[string]string{"LISTEN_TARGET": "admin"}, "LISTEN_TARGET"},
		{"DB のポートが範囲の外", map[string]string{"DB_PORT": "70000"}, "ポート"},
		{"接続の数の上限が 0", map[string]string{"DB_MAX_CONNS": "0"}, "DB_MAX_CONNS"},
		{"接続の数の上限が負の数", map[string]string{"DB_MAX_CONNS": "-1"}, "DB_MAX_CONNS"},
		{"接続の数の上限が数でない", map[string]string{"DB_MAX_CONNS": "many"}, "DB_MAX_CONNS"},
		{"HYDRA_ADMIN_URL が URL でない", map[string]string{"HYDRA_ADMIN_URL": "hydra:4445"}, "HYDRA_ADMIN_URL"},
		{"HYDRA_ISSUER が URL でない", map[string]string{"HYDRA_ISSUER": "hydra"}, "HYDRA_ISSUER"},
		{"PUBLIC_URL が URL でない", map[string]string{"PUBLIC_URL": "/login"}, "PUBLIC_URL"},
		{"UPSTREAM_IDP_BROWSER_ORIGIN が URL でない", map[string]string{"UPSTREAM_IDP_BROWSER_ORIGIN": "localhost:9000"}, "UPSTREAM_IDP_BROWSER_ORIGIN"},
		{"LOG_LEVEL が不正", map[string]string{"LOG_LEVEL": "verbose"}, "LOG_LEVEL"},
		{"TOKEN_HOOK_KEY が 31 バイト", map[string]string{"TOKEN_HOOK_KEY": "0123456789012345678901234567890"}, "TOKEN_HOOK_KEY"},
		{"LOGIN_COOKIE_KEYS が空の鍵だけ", map[string]string{"LOGIN_COOKIE_KEYS": " , "}, "LOGIN_COOKIE_KEYS"},
		{"LOGIN_COOKIE_KEYS の 2 番目の鍵が 31 バイト", map[string]string{"LOGIN_COOKIE_KEYS": "cookie-key-0123456789abcdef012345678,0123456789012345678901234567890"}, "LOGIN_COOKIE_KEYS の 2 番目"},
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
