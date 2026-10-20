// Package config は、環境変数から設定を読む。
package config

import (
	"errors"
	"fmt"
	"log/slog"
	"strconv"
	"strings"

	"github.com/Fukuemon/buddy/apps/schedule-api/internal/infrastructure/mysql"
)

// Config は、API とマイグレーションの設定である。
type Config struct {
	Port         string
	DB           mysql.Config
	AllowOrigins []string
	LogLevel     slog.Level
}

// Load は、getenv（本番では os.Getenv）から設定を読む。DB_USER、DB_PASSWORD、DB_NAME は必須で、
// 欠けているときは欠けた名前を並べたエラーを返す。パスワードに既定値はない。
//
// 読む環境変数と既定値:
//   - PORT: HTTP の待ち受けのポート。既定は 8080
//   - DB_HOST: 既定は localhost
//   - DB_PORT: 既定は 3306
//   - DB_USER、DB_PASSWORD、DB_NAME
//   - CORS_ALLOW_ORIGINS: カンマで区切ったオリジン。空なら CORS のヘッダーを返さない
//   - LOG_LEVEL: debug、info、warn、error。既定は info
func Load(getenv func(string) string) (Config, error) {
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
	}
	var missing []string
	for _, key := range []string{"DB_USER", "DB_PASSWORD", "DB_NAME"} {
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
