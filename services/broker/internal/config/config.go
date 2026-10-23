// Package config は、ブローカーの設定を環境変数から読む。
package config

import (
	"errors"
	"fmt"
	"log/slog"
	"net/url"
	"strconv"
	"strings"
)

// DB は、ブローカーの DB への接続の値である。Hydra の DB とは分ける。
type DB struct {
	Host     string
	Port     string
	User     string
	Password string
	Name     string
}

// Config は、ブローカーとマイグレーションの設定である。
type Config struct {
	Port     string
	LogLevel slog.Level
	DB       DB
	// HydraAdminURL は、ログインと同意の accept と reject、セッションの取り消しに呼ぶ Hydra の admin API の URL である。
	HydraAdminURL string
	// UpstreamIdPsFile は、組織の ID と、上流の IdP の issuer と client ID の対応（JSON）のパスである。形は upstream.Load にある。
	UpstreamIdPsFile string
	// UpstreamClientSecretsFile は、組織の ID と、上流の IdP の client secret の対応（JSON）のパスである。シークレットとして渡す。
	UpstreamClientSecretsFile string
	// PublicURL は、ブラウザが開くブローカーの URL である。上流の IdP のコールバックの URL をここから作る。
	PublicURL string
	// UpstreamBrowserOrigin は、上流の IdP の認可の画面へ転送するときに、scheme とホストを替える origin である。
	// ローカル環境のように、ブローカーが discovery を読む issuer にブラウザが届かないときだけ渡す。
	UpstreamBrowserOrigin string
	// ClientIPHeader は、ログインの試行を数える送り手のアドレスを読む、前段のプロキシが付けるヘッダーの名前である。
	// 空なら接続の相手のアドレスを使う。ブローカーに前段のプロキシを通らずに届かないときだけ渡す。
	ClientIPHeader string
	// AutoConsentClients は、同意の画面を出さずに accept するクライアントの ID である。
	AutoConsentClients []string
	// HydraIssuer は、Hydra のトークンの iss である。内部の API は、discovery の文書の JWKS で client credentials の
	// access token を検証する。
	HydraIssuer string
	// InternalAPIAudience は、内部の API が access token の aud に求める値である。
	InternalAPIAudience string
	// TokenHookKey は、Hydra が oauth2.token_hook を呼ぶときにヘッダーに入れる値である。シークレットとして渡す。
	TokenHookKey string
}

// Load は、getenv（本番では os.Getenv）から設定を読む。DB_USER、DB_PASSWORD、DB_NAME、HYDRA_ADMIN_URL、HYDRA_ISSUER、
// UPSTREAM_IDPS_FILE、UPSTREAM_IDP_CLIENT_SECRETS_FILE、PUBLIC_URL、TOKEN_HOOK_KEY は必須で、欠けているときは欠けた名前を並べたエラーを返す。
//
// 読む環境変数とデフォルト値:
//   - PORT: HTTP の待ち受けのポート。デフォルトは 8080
//   - LOG_LEVEL: debug、info、warn、error。デフォルトは info
//   - DB_HOST: デフォルトは localhost
//   - DB_PORT: デフォルトは 5432
//   - DB_USER、DB_PASSWORD、DB_NAME
//   - HYDRA_ADMIN_URL: Hydra の admin API の URL
//   - UPSTREAM_IDPS_FILE: 組織の ID と、上流の IdP の issuer と client ID の対応（JSON）のパス
//   - UPSTREAM_IDP_CLIENT_SECRETS_FILE: 組織の ID と、上流の IdP の client secret の対応（JSON）のパス
//   - PUBLIC_URL: ブラウザが開くブローカーの URL
//   - UPSTREAM_IDP_BROWSER_ORIGIN: 上流の IdP の認可の画面へ転送するときに替える origin。無ければ替えない
//   - CLIENT_IP_HEADER: ログインの試行を数える送り手のアドレスを読む、前段のプロキシが付けるヘッダーの名前。無ければ接続の相手のアドレス
//   - AUTO_CONSENT_CLIENTS: 同意の画面を出さずに accept するクライアントの ID をカンマで区切った値。デフォルトは web
//   - HYDRA_ISSUER: Hydra のトークンの iss。内部の API が access token を検証する discovery の文書をここから読む
//   - INTERNAL_API_AUDIENCE: 内部の API が access token の aud に求める値。デフォルトは broker
//   - TOKEN_HOOK_KEY: Hydra が oauth2.token_hook を呼ぶときにヘッダーに入れる値
func Load(getenv func(string) string) (Config, error) {
	return load(getenv, true)
}

// LoadDB は、Load と同じ規則で DB の接続の値だけを読む。マイグレーションのコマンドが使い、Hydra と上流の IdP の環境変数を求めない。
func LoadDB(getenv func(string) string) (DB, error) {
	c, err := load(getenv, false)
	return c.DB, err
}

func load(getenv func(string) string, broker bool) (Config, error) {
	get := func(key, def string) string {
		if v := strings.TrimSpace(getenv(key)); v != "" {
			return v
		}
		return def
	}
	c := Config{
		Port: get("PORT", "8080"),
		DB: DB{
			Host:     get("DB_HOST", "localhost"),
			Port:     get("DB_PORT", "5432"),
			User:     getenv("DB_USER"),
			Password: getenv("DB_PASSWORD"),
			Name:     getenv("DB_NAME"),
		},
		HydraAdminURL:             strings.TrimSpace(getenv("HYDRA_ADMIN_URL")),
		UpstreamIdPsFile:          strings.TrimSpace(getenv("UPSTREAM_IDPS_FILE")),
		UpstreamClientSecretsFile: strings.TrimSpace(getenv("UPSTREAM_IDP_CLIENT_SECRETS_FILE")),
		PublicURL:                 strings.TrimSuffix(strings.TrimSpace(getenv("PUBLIC_URL")), "/"),
		UpstreamBrowserOrigin:     strings.TrimSpace(getenv("UPSTREAM_IDP_BROWSER_ORIGIN")),
		ClientIPHeader:            strings.TrimSpace(getenv("CLIENT_IP_HEADER")),
		HydraIssuer:               strings.TrimSpace(getenv("HYDRA_ISSUER")),
		InternalAPIAudience:       get("INTERNAL_API_AUDIENCE", "broker"),
		TokenHookKey:              getenv("TOKEN_HOOK_KEY"),
	}
	for _, id := range strings.Split(get("AUTO_CONSENT_CLIENTS", "web"), ",") {
		if id = strings.TrimSpace(id); id != "" {
			c.AutoConsentClients = append(c.AutoConsentClients, id)
		}
	}
	required := []string{"DB_USER", "DB_PASSWORD", "DB_NAME"}
	if broker {
		required = append(required, "HYDRA_ADMIN_URL", "HYDRA_ISSUER", "UPSTREAM_IDPS_FILE", "UPSTREAM_IDP_CLIENT_SECRETS_FILE", "PUBLIC_URL", "TOKEN_HOOK_KEY")
	}
	var missing []string
	for _, key := range required {
		if strings.TrimSpace(getenv(key)) == "" {
			missing = append(missing, key)
		}
	}
	if len(missing) > 0 {
		return Config{}, fmt.Errorf("環境変数 %s が必要である", strings.Join(missing, "、"))
	}
	for _, p := range []string{c.Port, c.DB.Port} {
		if n, err := strconv.Atoi(p); err != nil || n < 1 || n > 65535 {
			return Config{}, fmt.Errorf("ポート %q は 1 から 65535 の数にする", p)
		}
	}
	if broker {
		for _, v := range []struct{ key, value string }{
			{"HYDRA_ADMIN_URL", c.HydraAdminURL},
			{"HYDRA_ISSUER", c.HydraIssuer},
			{"PUBLIC_URL", c.PublicURL},
			{"UPSTREAM_IDP_BROWSER_ORIGIN", c.UpstreamBrowserOrigin},
		} {
			if u, err := url.Parse(v.value); v.value != "" && (err != nil || (u.Scheme != "https" && u.Scheme != "http") || u.Host == "") {
				return Config{}, fmt.Errorf("%s %q は http か https の URL にする", v.key, v.value)
			}
		}
	}
	if err := c.LogLevel.UnmarshalText([]byte(get("LOG_LEVEL", "info"))); err != nil {
		return Config{}, errors.New("LOG_LEVEL は debug、info、warn、error のいずれかにする")
	}
	return c, nil
}
