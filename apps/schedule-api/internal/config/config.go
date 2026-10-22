// Package config は、環境変数から設定を読む。
package config

import (
	"errors"
	"fmt"
	"log/slog"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/Fukuemon/buddy/packages/go/oidc"
)

// DB は、DB への接続の値である。DB のアダプタは、cmd がこの値から自分の設定を作る。
type DB struct {
	Host     string
	Port     string
	User     string
	Password string
	Name     string
}

// Calendar は、Google カレンダーを読む設定である。ServiceAccount が空なら、Google カレンダーを読まない。
type Calendar struct {
	// ServiceAccount は、職員がカレンダーを共有する相手のサービスアカウントのメールアドレスである。
	ServiceAccount string
	// Endpoint は、Calendar API の代わりに呼ぶ URL で、フェイクの API に向けるときだけ持つ。
	Endpoint string
	// ExportEnabled は、予定を Google カレンダーに書き出すかである。false なら、書き出しの待ちを積まず、書き出しの処理も動かさない。
	ExportEnabled bool
	// ExportInterval は、予定の書き出しの待ちを確かめる間隔である。
	ExportInterval time.Duration
	// SyncEnabled は、Google カレンダーの変更を buddy の予定に当てるかである。false なら、同期の処理を動かさない。
	SyncEnabled bool
	// SyncInterval は、Google カレンダーの変わった予定を読む間隔である。
	SyncInterval time.Duration
}

// Config は、API とマイグレーションの設定である。
type Config struct {
	Port         string
	DB           DB
	OIDC         oidc.Config
	AllowOrigins []string
	LogLevel     slog.Level
	Calendar     Calendar
}

// Load は、getenv（本番では os.Getenv）から設定を読む。DB_USER、DB_PASSWORD、DB_NAME、OIDC_ISSUER、
// OIDC_AUDIENCE は必須で、欠けているときは欠けた名前を並べたエラーを返す。パスワードにデフォルト値はない。
//
// 読む環境変数とデフォルト値:
//   - PORT: HTTP の待ち受けのポート。デフォルトは 8080
//   - DB_HOST: デフォルトは localhost
//   - DB_PORT: デフォルトは 5432
//   - DB_USER、DB_PASSWORD、DB_NAME
//   - OIDC_ISSUER: ブローカーの Issuer の URL。トークンの iss と一致させ、discovery の文書をここから読む
//   - OIDC_AUDIENCE: トークンの aud に求める値
//   - OIDC_ORG_CLAIM: 組織の ID を持つクレームの名前。デフォルトは org_id
//   - CORS_ALLOW_ORIGINS: カンマで区切ったオリジン。空なら CORS のヘッダーを返さない
//   - LOG_LEVEL: debug、info、warn、error。デフォルトは info
//   - GOOGLE_CALENDAR_SERVICE_ACCOUNT: 職員がカレンダーを共有する相手のサービスアカウントのメールアドレス。
//     空なら Google カレンダーを読まない。認証の情報は Application Default Credentials で読む
//   - GOOGLE_CALENDAR_ENDPOINT: Calendar API の代わりに呼ぶ URL。フェイクの API で試すためのもので、認証をしない。
//     GOOGLE_CALENDAR_SERVICE_ACCOUNT と一緒に渡す
//   - GOOGLE_CALENDAR_EXPORT_ENABLED: true なら、予定を Google カレンダーに書き出す。デフォルトは false。
//     GOOGLE_CALENDAR_SERVICE_ACCOUNT と一緒に渡し、認証の情報のスコープは calendar.events になる
//   - GOOGLE_CALENDAR_EXPORT_INTERVAL: 予定の書き出しの待ちを確かめる間隔（Go の時間の書式。例は 30s）。デフォルトは 30s。1s 以上にする
//   - GOOGLE_CALENDAR_SYNC_ENABLED: true なら、Google カレンダーの変更を buddy の予定に当てる。デフォルトは false。
//     GOOGLE_CALENDAR_EXPORT_ENABLED を true にして渡す
//   - GOOGLE_CALENDAR_SYNC_INTERVAL: Google カレンダーの変わった予定を読む間隔（Go の時間の書式）。デフォルトは 2m。1s 以上にする
func Load(getenv func(string) string) (Config, error) {
	return load(getenv, true)
}

// LoadDB は、Load と同じ規則で DB の接続の値だけを読む。マイグレーションのコマンドが使い、OIDC の環境変数を求めない。
func LoadDB(getenv func(string) string) (DB, error) {
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
		DB: DB{
			Host:     get("DB_HOST", "localhost"),
			Port:     get("DB_PORT", "5432"),
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
	c.Calendar = Calendar{
		ServiceAccount: strings.TrimSpace(getenv("GOOGLE_CALENDAR_SERVICE_ACCOUNT")),
		Endpoint:       strings.TrimSpace(getenv("GOOGLE_CALENDAR_ENDPOINT")),
	}
	interval, err := time.ParseDuration(get("GOOGLE_CALENDAR_EXPORT_INTERVAL", "30s"))
	if err != nil || interval < time.Second {
		return Config{}, errors.New("GOOGLE_CALENDAR_EXPORT_INTERVAL は 1s 以上の時間（例は 30s）です")
	}
	c.Calendar.ExportInterval = interval
	if c.Calendar.ExportEnabled, err = boolOf(getenv, "GOOGLE_CALENDAR_EXPORT_ENABLED"); err != nil {
		return Config{}, err
	}
	if c.Calendar.ExportEnabled && c.Calendar.ServiceAccount == "" {
		return Config{}, errors.New("GOOGLE_CALENDAR_EXPORT_ENABLED は GOOGLE_CALENDAR_SERVICE_ACCOUNT と一緒に渡します")
	}
	syncInterval, err := time.ParseDuration(get("GOOGLE_CALENDAR_SYNC_INTERVAL", "2m"))
	if err != nil || syncInterval < time.Second {
		return Config{}, errors.New("GOOGLE_CALENDAR_SYNC_INTERVAL は 1s 以上の時間（例は 2m）です")
	}
	c.Calendar.SyncInterval = syncInterval
	if c.Calendar.SyncEnabled, err = boolOf(getenv, "GOOGLE_CALENDAR_SYNC_ENABLED"); err != nil {
		return Config{}, err
	}
	// buddy の変更を書き出さずに Google の変更だけを当てると、buddy で変えた予定は全て両方の変更になり、確かめが要る予定に出続ける。
	if c.Calendar.SyncEnabled && !c.Calendar.ExportEnabled {
		return Config{}, errors.New("GOOGLE_CALENDAR_SYNC_ENABLED は GOOGLE_CALENDAR_EXPORT_ENABLED を true にして渡します")
	}
	if c.Calendar.Endpoint != "" && c.Calendar.ServiceAccount == "" {
		return Config{}, errors.New("GOOGLE_CALENDAR_ENDPOINT は GOOGLE_CALENDAR_SERVICE_ACCOUNT と一緒に渡します")
	}
	return c, nil
}

// boolOf は、環境変数 name を true か false で読む。空なら false である。
func boolOf(getenv func(string) string, name string) (bool, error) {
	switch v := strings.TrimSpace(getenv(name)); v {
	case "", "false":
		return false, nil
	case "true":
		return true, nil
	default:
		return false, fmt.Errorf("%s %q は true か false です", name, v)
	}
}
