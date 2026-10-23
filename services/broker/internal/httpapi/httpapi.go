// Package httpapi は、ブローカーの HTTP のハンドラを持つ。ヘルスチェックを持ち、ログインと同意の画面を login のハンドラに、
// /internal/ の下を内部の API のハンドラに渡す。
package httpapi

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
)

// Config は、NewHandler の設定である。
type Config struct {
	Logger *slog.Logger
	// Ready は GET /readyz が依存先を確かめる関数で、nil なら常にリクエストを受けられるとみなす。
	Ready func(context.Context) error
	// Login は、/login と /consent の下の画面のハンドラである。nil なら、これらのパスは 404 を返す。
	Login http.Handler
	// Internal は、/internal/ の下の内部の API のハンドラである。nil なら、これらのパスは 404 を返す。
	Internal http.Handler
}

type status struct {
	Status string `json:"status"`
}

// NewHandler は、GET /healthz と GET /readyz と、cfg.Login の画面と、cfg.Internal の内部の API を持つ http.Handler を返す。
// /healthz は依存先を確かめずに 200 を返し、/readyz は cfg.Ready が失敗すれば 503 を返す。
func NewHandler(cfg Config) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(cfg.Logger, w, http.StatusOK, status{"ok"})
	})
	mux.HandleFunc("GET /readyz", func(w http.ResponseWriter, r *http.Request) {
		if cfg.Ready != nil {
			if err := cfg.Ready(r.Context()); err != nil {
				cfg.Logger.WarnContext(r.Context(), "依存先に届かない", "error", err)
				writeJSON(cfg.Logger, w, http.StatusServiceUnavailable, status{"unavailable"})
				return
			}
		}
		writeJSON(cfg.Logger, w, http.StatusOK, status{"ok"})
	})
	if cfg.Login != nil {
		for _, p := range []string{"/login", "/login/", "/consent"} {
			mux.Handle(p, cfg.Login)
		}
	}
	if cfg.Internal != nil {
		mux.Handle("/internal/", cfg.Internal)
	}
	return mux
}

func writeJSON(logger *slog.Logger, w http.ResponseWriter, code int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	if err := json.NewEncoder(w).Encode(body); err != nil {
		logger.Error("レスポンスを書けない", "error", err)
	}
}
