// Package internalapi は、ブローカーの内部の API を持つ（ADR-0017）。
//
// 職員の登録、有効化、削除、停止は、予定の API が職員の管理の権限を確認してから呼ぶ。Hydra の client credentials の
// access token（aud は broker）のうち、許したクライアントのものだけを受ける。Hydra の oauth2.token_hook は、
// Hydra が token_hook の設定のヘッダーで呼ぶ。ログインの画面と別のポートで待ち受け、ブラウザに開かない。
package internalapi

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"slices"
	"strings"
	"time"

	"github.com/Fukuemon/buddy/services/broker/internal/staff"
)

// TokenHookKeyHeader は、Hydra が token_hook を呼ぶときに、token_hook の鍵を入れるヘッダーである。
const TokenHookKeyHeader = "Token-Hook-Key"

const (
	maxBodyLen = 1 << 16
	// maxHookBodyLen は、token_hook の本文を読む上限である。本文は Hydra のセッションで、クレームの数で大きくなる。
	maxHookBodyLen = 1 << 20
)

// Config は、NewHandler の設定である。
type Config struct {
	Logger   *slog.Logger
	Staff    Store
	Hydra    Hydra
	Verifier TokenVerifier
	// Clients は、内部の API を呼んでよいクライアントの ID である。client credentials のトークンの sub と、
	// token_hook が素通しする client credentials の要求の client_id を、ここに挙げた ID と照合する。
	Clients []string
	// KnownOrg は、組織の ID が上流の IdP の設定にあるかを返す。設定に無い事業所には職員を登録しない。
	KnownOrg func(orgID string) bool
	// NewID は、職員の ID（ULID）を発行する。
	NewID func() string
	// TokenHookKey は、Hydra が token_hook を呼ぶときに TokenHookKeyHeader に入れる値である。
	TokenHookKey string
	// Now は、token_hook がログインからの長さを測る時刻である。nil なら time.Now を使う。
	Now func() time.Time
}

type handler struct {
	Config
}

// NewHandler は、次の経路を持つ http.Handler を返す。
//   - POST /internal/staff: 職員を登録の途中の状態で登録する。同じ事業所に同じメールの職員がいれば、その職員を返す
//   - POST /internal/staff/{id}/activate: 登録の途中の職員を有効にする。予定の API が職員を書き終えてから呼ぶ
//   - DELETE /internal/staff/{id}: 登録の途中の職員を消す。予定の API が登録を戻すときに使う
//   - POST /internal/staff/{id}/suspend: 職員を止め（休職）、Hydra のログインのセッションと同意を取り消す
//   - POST /internal/staff/{id}/resume: 止めた職員を有効に戻す（復職）
//   - POST /internal/staff/{id}/retire: 職員を退職にしてメールと上流のアカウントを消し、Hydra のログインのセッションと同意を取り消す
//   - POST /internal/token-hook: Hydra の oauth2.token_hook。有効でない職員と、上流のログインから staff.SessionMaxAge を過ぎたトークンを拒む
//
// /internal/staff の下は、cfg.Verifier が検証した access token が無ければ 401 を、cfg.Clients に無いクライアントか
// 組織の ID を持つトークン（職員のトークン）なら 403 を返す。
// /internal/token-hook は、TokenHookKeyHeader が cfg.TokenHookKey と違えば 401 を返す。
func NewHandler(cfg Config) http.Handler {
	if cfg.Now == nil {
		cfg.Now = time.Now
	}
	h := handler{cfg}
	mux := http.NewServeMux()
	mux.Handle("POST /internal/staff", h.requireClient(h.register))
	mux.Handle("POST /internal/staff/{id}/activate", h.requireClient(h.activate))
	mux.Handle("DELETE /internal/staff/{id}", h.requireClient(h.delete))
	mux.Handle("POST /internal/staff/{id}/suspend", h.requireClient(h.suspend))
	mux.Handle("POST /internal/staff/{id}/resume", h.requireClient(h.resume))
	mux.Handle("POST /internal/staff/{id}/retire", h.requireClient(h.retire))
	mux.HandleFunc("POST /internal/token-hook", h.tokenHook)
	return mux
}

// requireClient は、Bearer の access token を検証してから next を呼ぶ。トークンが無いか検証できなければ 401 を返す。
// トークンの sub が cfg.Clients に無いか、トークンが組織の ID を持てば 403 を返す。client credentials のトークンの sub は
// クライアントの ID で、組織の ID は同意で職員のトークンにだけ入る。
func (h handler) requireClient(next http.HandlerFunc) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
		if !ok || strings.TrimSpace(raw) == "" {
			w.Header().Set("WWW-Authenticate", `Bearer`)
			h.writeError(w, r, http.StatusUnauthorized, "unauthenticated", "access token がありません", nil)
			return
		}
		id, err := h.Verifier.Verify(r.Context(), strings.TrimSpace(raw))
		if err != nil {
			w.Header().Set("WWW-Authenticate", `Bearer error="invalid_token"`)
			h.writeError(w, r, http.StatusUnauthorized, "unauthenticated", "access token が正しくありません", err)
			return
		}
		if !slices.Contains(h.Clients, id.Subject) || id.OrgID != "" {
			h.writeError(w, r, http.StatusForbidden, "forbidden", "このクライアントは内部の API を呼べません", nil)
			return
		}
		h.Logger.InfoContext(r.Context(), "内部の API を受けた", "client", id.Subject, "method", r.Method, "path", r.URL.Path)
		next(w, r)
	})
}

// ErrorBody は、内部の API の失敗の応答の本文である。httpapi が panic のときに返す 500 も、同じ形にする。
type ErrorBody struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// storeErrors は、Store が返す番兵のエラーごとに、応答の状態コードと文を決める。応答の code は、番兵のエラーの Code にする。
var storeErrors = map[*staff.Error]struct {
	status  int
	message string
}{
	staff.ErrNotFound:     {http.StatusNotFound, "職員がいません"},
	staff.ErrSuspended:    {http.StatusConflict, "職員が止められています"},
	staff.ErrRetired:      {http.StatusConflict, "職員は退職しています"},
	staff.ErrNotPending:   {http.StatusConflict, "登録の途中でない職員は消せません"},
	staff.ErrNotSuspended: {http.StatusConflict, "止めていない職員は戻せません"},
	staff.ErrEmailTaken:   {http.StatusConflict, "同じメールの職員がほかの事業所にいます"},
}

// writeStoreError は、Store が返した err を応答にする。storeErrors に無いエラーは、文を internalMsg にした internal の 500 にする。
func (h handler) writeStoreError(w http.ResponseWriter, r *http.Request, err error, internalMsg string) {
	if se, ok := errors.AsType[*staff.Error](err); ok {
		if e, ok := storeErrors[se]; ok {
			h.writeError(w, r, e.status, se.Code, e.message, err)
			return
		}
	}
	h.writeError(w, r, http.StatusInternalServerError, "internal", internalMsg, err)
}

func (h handler) writeError(w http.ResponseWriter, r *http.Request, code int, kind, msg string, err error) {
	level := slog.LevelWarn
	if code >= http.StatusInternalServerError {
		level = slog.LevelError
	}
	h.Logger.Log(r.Context(), level, "内部の API がエラーを返す", "status", code, "reason", msg, "error", err)
	WriteJSON(h.Logger, w, code, ErrorBody{Code: kind, Message: msg})
}

// WriteJSON は、body を JSON にして code で書く。書けなければ logger にエラーを書く。
func WriteJSON(logger *slog.Logger, w http.ResponseWriter, code int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	if err := json.NewEncoder(w).Encode(body); err != nil {
		logger.Error("レスポンスを書けない", "error", err)
	}
}
