// Package config は、環境変数から設定を読む。
package config

import (
	"errors"
	"fmt"
	"log/slog"
	"net/url"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/Fukuemon/buddy/packages/go/oidc"
)

// DB は、DB への接続の値である。DB のアダプタの設定は、assemble と cmd/migrate がこの値から作る。
type DB struct {
	Host     string
	Port     string
	User     string
	Password string
	Name     string
	// MaxConns は、接続のプールの接続の数の上限である。0 なら、DB のアダプタのデフォルトの数にする。
	MaxConns int32
}

// Calendar は、Google カレンダーを読む設定である。ServiceAccountsFile が空なら、Google カレンダーを読まない。
type Calendar struct {
	// ServiceAccountsFile は、組織の ID と、その事業所の職員がカレンダーを共有するサービスアカウントの対応（JSON）のパスである。
	// 形は gcalauth.LoadAccounts にある。
	ServiceAccountsFile string
	// Endpoint は、Calendar API の代わりに呼ぶ URL で、ローカル環境の calendarpit に向けるときだけ持つ。
	Endpoint string
	// ExportEnabled は、予定を Google カレンダーに書き出すかである。false なら、書き出しの待ちを積まず、書き出しの処理も動かさない。
	ExportEnabled bool
	// ExportInterval は、予定の書き出しの待ちを確認する間隔である。
	ExportInterval time.Duration
	// SyncEnabled は、Google カレンダーの変更を buddy の予定に当てるかである。false なら、同期の処理を動かさない。
	SyncEnabled bool
	// SyncInterval は、Google カレンダーの変わった予定を読む間隔である。
	SyncInterval time.Duration
}

// Broker は、ID ブローカーの内部の API（職員の登録、休職、復職、退職）を呼ぶ設定である（ADR-0001、ADR-0018）。
type Broker struct {
	// URL は、ブローカーの URL である。
	URL string
	// TokenURL は、client credentials の access token を取る Hydra のトークンのエンドポイントである。
	TokenURL string
	// ClientID と ClientSecret は、Hydra に登録した予定の API のクライアントである。ClientSecret はシークレットとして渡す。
	ClientID     string
	ClientSecret string
	// Audience は、access token の aud にする値である。
	Audience string
}

// API は、予定の API の HTTP サーバーの設定である。
type API struct {
	Port         string
	DB           DB
	OIDC         oidc.Config
	AllowOrigins []string
	LogLevel     slog.Level
	Calendar     Calendar
	Broker       Broker
}

// Worker は、Google カレンダーの書き出しと同期を動かす実行の単位の設定である。HTTP のサーバー、OIDC、ブローカーの値を持たない。
type Worker struct {
	DB       DB
	LogLevel slog.Level
	Calendar Calendar
}

// LoadAPI は、getenv（本番では os.Getenv）から予定の API の設定を読む。DB_USER、DB_PASSWORD、DB_NAME、OIDC_ISSUER、
// OIDC_AUDIENCE、BROKER_URL、BROKER_TOKEN_URL、BROKER_CLIENT_SECRET は必須で、欠けているときは欠けた名前を並べたエラーを返す。
// パスワードと client secret にデフォルト値はない。
//
// 読む環境変数とデフォルト値:
//   - PORT: HTTP の待ち受けのポート。デフォルトは 8080
//   - DB_HOST: デフォルトは localhost
//   - DB_PORT: デフォルトは 5432
//   - DB_MAX_CONNS: 接続のプールの接続の数の上限。1 以上の数で、空なら DB のアダプタのデフォルトの数（25）にする
//   - DB_USER、DB_PASSWORD、DB_NAME
//   - OIDC_ISSUER: Hydra の Issuer の URL。トークンの iss と一致させ、discovery の文書をここから読む
//   - OIDC_AUDIENCE: トークンの aud に求める値
//   - OIDC_ORG_CLAIM: 組織の ID を持つクレームの名前。デフォルトは org_id
//   - CORS_ALLOW_ORIGINS: カンマで区切ったオリジン。空なら CORS のヘッダーを返さない
//   - LOG_LEVEL: debug、info、warn、error。デフォルトは info
//   - BROKER_URL: ID ブローカーの URL。職員の登録、休職、復職、退職で内部の API を呼ぶ
//   - BROKER_TOKEN_URL: 内部の API を呼ぶ access token を client credentials で取る Hydra のトークンのエンドポイント
//   - BROKER_CLIENT_ID: Hydra に登録した予定の API のクライアントの ID。デフォルトは schedule
//   - BROKER_CLIENT_SECRET: Hydra に登録した予定の API のクライアントの secret
//   - BROKER_AUDIENCE: 内部の API を呼ぶ access token の aud。デフォルトは broker
//   - GOOGLE_CALENDAR_SERVICE_ACCOUNTS_FILE: 組織の ID と、その事業所の職員がカレンダーを共有するサービスアカウントの対応（JSON）のパス。
//     空なら Google カレンダーを読まない。Application Default Credentials で認証し、事業所のサービスアカウントになりすます（ADR-0029）
//   - GOOGLE_CALENDAR_ENDPOINT: Calendar API の代わりに呼ぶ URL。ローカル環境の calendarpit で試すためのもので、GOOGLE_APPLICATION_CREDENTIALS を渡したときだけ、その認証情報をなりすまさずに全ての事業所で使い、渡さなければ認証をしない。
//     GOOGLE_CALENDAR_SERVICE_ACCOUNTS_FILE と一緒に渡す
//   - GOOGLE_CALENDAR_EXPORT_ENABLED: true なら、予定を Google カレンダーに書き出す。デフォルトは false。
//     GOOGLE_CALENDAR_SERVICE_ACCOUNTS_FILE と一緒に渡し、認証の情報のスコープは calendar.events になる
//   - GOOGLE_CALENDAR_EXPORT_INTERVAL: 予定の書き出しの待ちを確認する間隔（Go の時間の書式。例は 30s）。デフォルトは 30s。1s 以上にする
//   - GOOGLE_CALENDAR_SYNC_ENABLED: true なら、Google カレンダーの変更を buddy の予定に当てる。デフォルトは false。
//     GOOGLE_CALENDAR_EXPORT_ENABLED を true にして渡す
//   - GOOGLE_CALENDAR_SYNC_INTERVAL: Google カレンダーの変わった予定を読む間隔（Go の時間の書式）。デフォルトは 2m。1s 以上にする
func LoadAPI(getenv func(string) string) (API, error) {
	return load(getenv, true)
}

// LoadWorker は、LoadAPI と同じ規則とデフォルト値で、DB_ と GOOGLE_CALENDAR_ で始まる変数と LOG_LEVEL だけを読む。
// 必須は DB_USER、DB_PASSWORD、DB_NAME だけで、OIDC、ブローカー、PORT、CORS_ALLOW_ORIGINS の変数を読まない。
func LoadWorker(getenv func(string) string) (Worker, error) {
	db := dbOf(getenv)
	if err := requireVars(getenv, dbRequired); err != nil {
		return Worker{}, err
	}
	if err := validatePort(db.Port); err != nil {
		return Worker{}, err
	}
	var err error
	if db.MaxConns, err = maxConnsOf(getenv); err != nil {
		return Worker{}, err
	}
	level, err := logLevelOf(getenv)
	if err != nil {
		return Worker{}, err
	}
	cal, err := calendarOf(getenv)
	if err != nil {
		return Worker{}, err
	}
	return Worker{DB: db, LogLevel: level, Calendar: cal}, nil
}

// LoadDB は、LoadAPI と同じ規則で DB の接続の値だけを読む。マイグレーションのコマンドが使い、OIDC の環境変数を求めない。
func LoadDB(getenv func(string) string) (DB, error) {
	c, err := load(getenv, false)
	return c.DB, err
}

var dbRequired = []string{"DB_USER", "DB_PASSWORD", "DB_NAME"}

func getOr(getenv func(string) string, key, def string) string {
	if v := getenv(key); v != "" {
		return v
	}
	return def
}

func load(getenv func(string) string, includesAPI bool) (API, error) {
	get := func(key, def string) string { return getOr(getenv, key, def) }
	c := API{
		Port: get("PORT", "8080"),
		DB:   dbOf(getenv),
		OIDC: oidc.Config{
			Issuer:   getenv("OIDC_ISSUER"),
			Audience: getenv("OIDC_AUDIENCE"),
			OrgClaim: get("OIDC_ORG_CLAIM", "org_id"),
		},
		Broker: Broker{
			URL:          strings.TrimSpace(getenv("BROKER_URL")),
			TokenURL:     strings.TrimSpace(getenv("BROKER_TOKEN_URL")),
			ClientID:     get("BROKER_CLIENT_ID", "schedule"),
			ClientSecret: getenv("BROKER_CLIENT_SECRET"),
			Audience:     get("BROKER_AUDIENCE", "broker"),
		},
	}
	required := dbRequired
	if includesAPI {
		required = append(slices.Clone(required), "OIDC_ISSUER", "OIDC_AUDIENCE", "BROKER_URL", "BROKER_TOKEN_URL", "BROKER_CLIENT_SECRET")
	}
	if err := requireVars(getenv, required); err != nil {
		return API{}, err
	}
	for _, p := range []string{c.Port, c.DB.Port} {
		if err := validatePort(p); err != nil {
			return API{}, err
		}
	}
	var err error
	if c.DB.MaxConns, err = maxConnsOf(getenv); err != nil {
		return API{}, err
	}
	if includesAPI {
		for _, v := range []struct{ key, value string }{
			{"OIDC_ISSUER", c.OIDC.Issuer},
			{"BROKER_URL", c.Broker.URL},
			{"BROKER_TOKEN_URL", c.Broker.TokenURL},
		} {
			if u, err := url.Parse(v.value); err != nil || (u.Scheme != "https" && u.Scheme != "http") || u.Host == "" {
				return API{}, fmt.Errorf("%s %q は http か https の URL です", v.key, v.value)
			}
		}
	}
	for _, o := range strings.Split(getenv("CORS_ALLOW_ORIGINS"), ",") {
		if o = strings.TrimSpace(o); o != "" {
			c.AllowOrigins = append(c.AllowOrigins, o)
		}
	}
	if c.LogLevel, err = logLevelOf(getenv); err != nil {
		return API{}, err
	}
	if c.Calendar, err = calendarOf(getenv); err != nil {
		return API{}, err
	}
	return c, nil
}

func dbOf(getenv func(string) string) DB {
	return DB{
		Host:     getOr(getenv, "DB_HOST", "localhost"),
		Port:     getOr(getenv, "DB_PORT", "5432"),
		User:     getenv("DB_USER"),
		Password: getenv("DB_PASSWORD"),
		Name:     getenv("DB_NAME"),
	}
}

// maxConnsOf は、DB_MAX_CONNS を接続の数の上限として読む。空なら 0 である。
func maxConnsOf(getenv func(string) string) (int32, error) {
	v := strings.TrimSpace(getenv("DB_MAX_CONNS"))
	if v == "" {
		return 0, nil
	}
	n, err := strconv.ParseInt(v, 10, 32)
	if err != nil || n < 1 {
		return 0, fmt.Errorf("DB_MAX_CONNS %q は 1 以上の数です", v)
	}
	return int32(n), nil
}

func requireVars(getenv func(string) string, keys []string) error {
	var missingNames []string
	for _, key := range keys {
		if getenv(key) == "" {
			missingNames = append(missingNames, key)
		}
	}
	if len(missingNames) > 0 {
		return fmt.Errorf("環境変数 %s が必要です", strings.Join(missingNames, ", "))
	}
	return nil
}

func validatePort(p string) error {
	if n, err := strconv.Atoi(p); err != nil || n < 1 || n > 65535 {
		return fmt.Errorf("ポート %q は 1 から 65535 の数です", p)
	}
	return nil
}

func logLevelOf(getenv func(string) string) (slog.Level, error) {
	var level slog.Level
	if err := level.UnmarshalText([]byte(getOr(getenv, "LOG_LEVEL", "info"))); err != nil {
		return 0, errors.New("LOG_LEVEL は debug、info、warn、error のいずれかです")
	}
	return level, nil
}

func calendarOf(getenv func(string) string) (Calendar, error) {
	c := Calendar{
		ServiceAccountsFile: strings.TrimSpace(getenv("GOOGLE_CALENDAR_SERVICE_ACCOUNTS_FILE")),
		Endpoint:            strings.TrimSpace(getenv("GOOGLE_CALENDAR_ENDPOINT")),
	}
	interval, err := time.ParseDuration(getOr(getenv, "GOOGLE_CALENDAR_EXPORT_INTERVAL", "30s"))
	if err != nil || interval < time.Second {
		return Calendar{}, errors.New("GOOGLE_CALENDAR_EXPORT_INTERVAL は 1s 以上の時間（例は 30s）です")
	}
	c.ExportInterval = interval
	if c.ExportEnabled, err = boolOf(getenv, "GOOGLE_CALENDAR_EXPORT_ENABLED"); err != nil {
		return Calendar{}, err
	}
	if c.ExportEnabled && c.ServiceAccountsFile == "" {
		return Calendar{}, errors.New("GOOGLE_CALENDAR_EXPORT_ENABLED は GOOGLE_CALENDAR_SERVICE_ACCOUNTS_FILE と一緒に渡します")
	}
	syncInterval, err := time.ParseDuration(getOr(getenv, "GOOGLE_CALENDAR_SYNC_INTERVAL", "2m"))
	if err != nil || syncInterval < time.Second {
		return Calendar{}, errors.New("GOOGLE_CALENDAR_SYNC_INTERVAL は 1s 以上の時間（例は 2m）です")
	}
	c.SyncInterval = syncInterval
	if c.SyncEnabled, err = boolOf(getenv, "GOOGLE_CALENDAR_SYNC_ENABLED"); err != nil {
		return Calendar{}, err
	}
	// buddy の変更を書き出さずに Google の変更だけを当てると、buddy で変えた予定は全て両方の変更になり、確認が必要な予定に出続ける。
	if c.SyncEnabled && !c.ExportEnabled {
		return Calendar{}, errors.New("GOOGLE_CALENDAR_SYNC_ENABLED は GOOGLE_CALENDAR_EXPORT_ENABLED を true にして渡します")
	}
	if c.Endpoint != "" && c.ServiceAccountsFile == "" {
		return Calendar{}, errors.New("GOOGLE_CALENDAR_ENDPOINT は GOOGLE_CALENDAR_SERVICE_ACCOUNTS_FILE と一緒に渡します")
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
