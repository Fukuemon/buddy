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
}

// Load は、getenv（本番では os.Getenv）から設定を読む。DB_USER、DB_PASSWORD、DB_NAME、HYDRA_ADMIN_URL、
// UPSTREAM_IDPS_FILE、UPSTREAM_IDP_CLIENT_SECRETS_FILE は必須で、欠けているときは欠けた名前を並べたエラーを返す。
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
	}
	required := []string{"DB_USER", "DB_PASSWORD", "DB_NAME"}
	if broker {
		required = append(required, "HYDRA_ADMIN_URL", "UPSTREAM_IDPS_FILE", "UPSTREAM_IDP_CLIENT_SECRETS_FILE")
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
	if u, err := url.Parse(c.HydraAdminURL); broker && (err != nil || (u.Scheme != "https" && u.Scheme != "http") || u.Host == "") {
		return Config{}, fmt.Errorf("HYDRA_ADMIN_URL %q は http か https の URL にする", c.HydraAdminURL)
	}
	if err := c.LogLevel.UnmarshalText([]byte(get("LOG_LEVEL", "info"))); err != nil {
		return Config{}, errors.New("LOG_LEVEL は debug、info、warn、error のいずれかにする")
	}
	return c, nil
}
