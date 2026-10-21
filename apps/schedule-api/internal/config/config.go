// Package config は、環境変数から設定を読む。
package config

import (
	"errors"
	"fmt"
	"log/slog"
	"net/url"
	"strconv"
	"strings"

	"github.com/Fukuemon/buddy/packages/go/oidc"

	"github.com/Fukuemon/buddy/apps/schedule-api/internal/mysql"
)

// Config は、API とマイグレーションの設定である。
type Config struct {
	Port         string
	DB           mysql.Config
	OIDC         oidc.Config
	AllowOrigins []string
	LogLevel     slog.Level
}

// Load は、getenv（本番では os.Getenv）から設定を読む。DB_USER、DB_PASSWORD、DB_NAME、OIDC_ISSUER、
// OIDC_AUDIENCE は必須で、欠けているときは欠けた名前を並べたエラーを返す。パスワードに既定値はない。
//
// 読む環境変数と既定値:
//   - PORT: HTTP の待ち受けのポート。既定は 8080
//   - DB_HOST: 既定は localhost
//   - DB_PORT: 既定は 3306
//   - DB_USER、DB_PASSWORD、DB_NAME
//   - OIDC_ISSUER: ブローカーの発行者の URL。トークンの iss と一致させ、discovery の文書をここから読む
//   - OIDC_AUDIENCE: トークンの aud に求める値
//   - OIDC_ORG_CLAIM: 組織の ID を持つクレームの名前。既定は org_id
//   - CORS_ALLOW_ORIGINS: カンマで区切ったオリジン。空なら CORS のヘッダーを返さない
//   - LOG_LEVEL: debug、info、warn、error。既定は info
func Load(getenv func(string) string) (Config, error) {
	return load(getenv, true)
}

// LoadDB は、Load と同じ規則で MySQL の接続の設定だけを読む。マイグレーションのコマンドが使い、OIDC の環境変数を求めない。
func LoadDB(getenv func(string) string) (mysql.Config, error) {
	c, err := load(getenv, false)
	return c.DB, err
}

func load(getenv func(string) string, api bool) (Config, error) {
	get := func(key, def string) string {
		if v := getenv(key); v != "" {
			return v
		}
		return def
	}
	c := Config{
		Port: get("PORT", "8080"),
		DB: mysql.Config{
			Host:     get("DB_HOST", "localhost"),
			Port:     get("DB_PORT", "3306"),
			User:     getenv("DB_USER"),
			Password: getenv("DB_PASSWORD"),
			Name:     getenv("DB_NAME"),
		},
		OIDC: oidc.Config{
			Issuer:   getenv("OIDC_ISSUER"),
			Audience: getenv("OIDC_AUDIENCE"),
			OrgClaim: get("OIDC_ORG_CLAIM", "org_id"),
		},
	}
	required := []string{"DB_USER", "DB_PASSWORD", "DB_NAME"}
	if api {
		required = append(required, "OIDC_ISSUER", "OIDC_AUDIENCE")
	}
	var missing []string
	for _, key := range required {
		if getenv(key) == "" {
			missing = append(missing, key)
		}
	}
	if len(missing) > 0 {
		return Config{}, fmt.Errorf("環境変数 %s が必要です", strings.Join(missing, ", "))
	}
	for _, p := range []string{c.Port, c.DB.Port} {
		if n, err := strconv.Atoi(p); err != nil || n < 1 || n > 65535 {
			return Config{}, fmt.Errorf("ポート %q は 1 から 65535 の数です", p)
		}
	}
	if u, err := url.Parse(c.OIDC.Issuer); api && (err != nil || (u.Scheme != "https" && u.Scheme != "http") || u.Host == "") {
		return Config{}, fmt.Errorf("OIDC_ISSUER %q は http か https の URL です", c.OIDC.Issuer)
	}
	for _, o := range strings.Split(getenv("CORS_ALLOW_ORIGINS"), ",") {
		if o = strings.TrimSpace(o); o != "" {
			c.AllowOrigins = append(c.AllowOrigins, o)
		}
	}
	if err := c.LogLevel.UnmarshalText([]byte(get("LOG_LEVEL", "info"))); err != nil {
		return Config{}, errors.New("LOG_LEVEL は debug、info、warn、error のいずれかです")
	}
	return c, nil
}
