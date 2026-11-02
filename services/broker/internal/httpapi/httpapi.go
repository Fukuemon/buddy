// Package httpapi は、ブローカーの HTTP のハンドラを持つ。ヘルスチェックを持ち、ログインと同意とログアウトの画面を login のハンドラに、
// /internal/ の下を内部の API のハンドラに渡す。cmd/broker は、画面と内部の API を別のポートの 2 つのハンドラで待ち受ける。
package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
)

// Config は、NewHandler の設定である。
type Config struct {
	Logger *slog.Logger
	// Ready は GET /readyz が依存先を確認する関数で、nil なら常にリクエストを受けられるとみなす。
	Ready func(context.Context) error
	// Login は、/login と /consent と /logout の下の画面のハンドラである。nil なら、これらのパスは 404 を返す。
	Login http.Handler
	// Internal は、/internal/ の下の内部の API のハンドラである。nil なら、これらのパスは 404 を返す。
	Internal http.Handler
}

type status struct {
	Status string `json:"status"`
}

// NewHandler は、GET /healthz と GET /readyz と、cfg.Login の画面と、cfg.Internal の内部の API を持つ http.Handler を返す。
// /healthz は依存先を確認せずに 200 を返し、/readyz は cfg.Ready が失敗すれば 503 を返す。
// ハンドラが panic すれば、内部の API と同じ形の 500 の JSON を返す。
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
		for _, p := range []string{"/login", "/login/", "/consent", "/logout"} {
			mux.Handle(p, cfg.Login)
		}
	}
	if cfg.Internal != nil {
		mux.Handle("/internal/", cfg.Internal)
	}
	return recoverPanic(cfg.Logger, mux)
}

func writeJSON(logger *slog.Logger, w http.ResponseWriter, code int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	if err := json.NewEncoder(w).Encode(body); err != nil {
		logger.Error("レスポンスを書けない", "error", err)
	}
}

type errorBody struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// recoverPanic は、next の panic を回復し、panic の値とパスをエラーのログに書いて、内部の API の 500 と同じ本文を返す。
// http.ErrAbortHandler は、net/http が接続を切る合図なので、回復せずにもう一度 panic する。
// レスポンスを書き始めた後の panic では、ステータスを書き直せないので、ログだけを書く。
func recoverPanic(logger *slog.Logger, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		rec := &wroteRecorder{ResponseWriter: w}
		defer func() {
			p := recover()
			if p == nil {
				return
			}
			if err, ok := p.(error); ok && errors.Is(err, http.ErrAbortHandler) {
				panic(p)
			}
			logger.ErrorContext(r.Context(), "panic", "recovered", p, "path", r.URL.Path)
			if !rec.wrote {
				writeJSON(logger, w, http.StatusInternalServerError, errorBody{Code: "internal", Message: "処理に失敗しました"})
			}
		}()
		next.ServeHTTP(rec, r)
	})
}

// wroteRecorder は、レスポンスのステータスを書いたかを覚える。
type wroteRecorder struct {
	http.ResponseWriter
	wrote bool
}

func (r *wroteRecorder) WriteHeader(status int) {
	r.wrote = true
	r.ResponseWriter.WriteHeader(status)
}

func (r *wroteRecorder) Write(b []byte) (int, error) {
	r.wrote = true
	return r.ResponseWriter.Write(b)
}

// Unwrap は、http.ResponseController が元の ResponseWriter の Flush などを呼べるよう、包んだ ResponseWriter を返す。
func (r *wroteRecorder) Unwrap() http.ResponseWriter {
	return r.ResponseWriter
}
