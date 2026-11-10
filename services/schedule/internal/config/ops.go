package config

import "log/slog"

// Ops は、運営用の CLI（cmd/ops）の設定である。HTTP のサーバー、OIDC、Google カレンダーの値を持たない。
// Broker は、運営用の Hydra のクライアントで、ブローカーは職員の登録、有効化、登録の途中の職員の削除だけを許す。
type Ops struct {
	DB       DB
	LogLevel slog.Level
	Broker   Broker
}

// LoadOps は、getenv から運営用の CLI の設定を読む。DB_ の変数と LOG_LEVEL と BROKER_ の変数は LoadAPI と同じ規則で読む。
// DB_USER、DB_PASSWORD、DB_NAME、BROKER_URL、BROKER_TOKEN_URL、BROKER_CLIENT_SECRET は必須である。
// BROKER_CLIENT_ID のデフォルトは、予定の API と違う運営用のクライアントの schedule-ops である。
func LoadOps(getenv func(string) string) (Ops, error) {
	if err := requireVars(getenv, append(append([]string{}, dbRequired...), "BROKER_URL", "BROKER_TOKEN_URL", "BROKER_CLIENT_SECRET")); err != nil {
		return Ops{}, err
	}
	c := Ops{DB: dbOf(getenv), Broker: brokerOf(getenv, "schedule-ops")}
	if err := validatePort(c.DB.Port); err != nil {
		return Ops{}, err
	}
	var err error
	if c.DB.MaxConns, err = maxConnsOf(getenv); err != nil {
		return Ops{}, err
	}
	if err := validateBroker(c.Broker); err != nil {
		return Ops{}, err
	}
	if c.LogLevel, err = logLevelOf(getenv); err != nil {
		return Ops{}, err
	}
	return c, nil
}
