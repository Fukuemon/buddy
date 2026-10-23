// Package internalapi は、ブローカーの内部の API を持つ（ADR-0017）。
//
// 職員の登録、削除、停止は、予定の API が職員の管理の権限を確認してから呼ぶ。Hydra の client credentials の
// access token（aud は broker）だけを受ける。Hydra の oauth2.token_hook は、Hydra が token_hook の設定のヘッダーで呼ぶ。
package internalapi

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"slices"
	"strings"
	"time"

	"github.com/Fukuemon/buddy/packages/go/oidc"

	"github.com/Fukuemon/buddy/services/broker/internal/login"
)

// MaxAuthAge は、上流の IdP でログインしてから、トークンを発行してよい長さである。Hydra のログインのセッションと、
// web のセッションの長さと同じにする。上流で止めたアカウントは、この長さを過ぎた次の上流のログインで拒まれる。
const MaxAuthAge = 12 * time.Hour

// TokenHookKeyHeader は、Hydra が token_hook を呼ぶときに、token_hook の鍵を入れるヘッダーである。
const TokenHookKeyHeader = "Token-Hook-Key"

const (
	maxBodyLen  = 1 << 16
	maxEmailLen = 320
	// maxHookBodyLen は、token_hook の本文を読む上限である。本文は Hydra のセッションで、クレームの数で大きくなる。
	maxHookBodyLen = 1 << 20
)

var (
	// ErrSuspended は、登録しようとしたメールの職員が、同じ事業所で止められていることを示す。
	ErrSuspended = errors.New("職員が止められている")
	// ErrLinked は、上流のアカウントを結び付けた職員を消そうとしたことを示す。
	ErrLinked = errors.New("職員に上流のアカウントが結び付いている")
)

// Store は、ブローカーの職員を読み書きする。
type Store interface {
	// Get は、ID が id の職員を返す。いなければ login.ErrNotFound を返す。
	Get(ctx context.Context, id string) (login.StaffMember, error)
	// Register は、m の事業所に m のメールの職員がいなければ m を書き、書いた職員と true を返す。
	// 同じ事業所に同じメールの職員がいれば、書かずにその職員と false を返す。
	Register(ctx context.Context, m login.StaffMember) (login.StaffMember, bool, error)
	// Delete は、上流のアカウントを結び付けていない職員 id を消す。いなければ login.ErrNotFound を、
	// 結び付けていれば ErrLinked を返す。
	Delete(ctx context.Context, id string) error
	// Suspend は、職員 id を止める。止めた職員を止めても成功する。いなければ login.ErrNotFound を返す。
	Suspend(ctx context.Context, id string) error
}

// Hydra は、職員のログインのセッションと同意を取り消す Hydra の admin API の呼び出しである。約束は hydra.Client と同じである。
type Hydra interface {
	RevokeLoginSessions(ctx context.Context, subject string) error
	RevokeConsentSessions(ctx context.Context, subject string) error
}

// TokenVerifier は、内部の API を呼んだクライアントの access token を検証する。約束は oidc.Verifier と同じである。
type TokenVerifier interface {
	Verify(ctx context.Context, raw string) (oidc.Identity, error)
}

// Config は、NewHandler の設定である。
type Config struct {
	Logger   *slog.Logger
	Staff    Store
	Hydra    Hydra
	Verifier TokenVerifier
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
//   - POST /internal/staff: 職員を登録する。同じ事業所に同じメールの職員がいれば、その職員を返す
//   - DELETE /internal/staff/{id}: 上流のアカウントを結び付けていない職員を消す。予定の API が登録を戻すときに使う
//   - POST /internal/staff/{id}/suspend: 職員を止め、Hydra のログインのセッションと同意を取り消す
//   - POST /internal/token-hook: Hydra の oauth2.token_hook。止めた職員と、上流のログインから MaxAuthAge を過ぎたトークンを拒む
//
// /internal/staff の下は、cfg.Verifier が検証した access token が無ければ 401 を返す。
// /internal/token-hook は、TokenHookKeyHeader が cfg.TokenHookKey と違えば 401 を返す。
func NewHandler(cfg Config) http.Handler {
	if cfg.Now == nil {
		cfg.Now = time.Now
	}
	h := handler{cfg}
	mux := http.NewServeMux()
	mux.Handle("POST /internal/staff", h.requireClient(h.register))
	mux.Handle("DELETE /internal/staff/{id}", h.requireClient(h.delete))
	mux.Handle("POST /internal/staff/{id}/suspend", h.requireClient(h.suspend))
	mux.HandleFunc("POST /internal/token-hook", h.tokenHook)
	return mux
}

// requireClient は、Bearer の access token を検証してから next を呼ぶ。トークンが無いか検証できなければ 401 を返す。
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
		h.Logger.InfoContext(r.Context(), "内部の API を受けた", "client", id.Subject, "method", r.Method, "path", r.URL.Path)
		next(w, r)
	})
}

// staffBody は、内部の API の職員である。
type staffBody struct {
	ID     string `json:"id"`
	OrgID  string `json:"org_id"`
	Email  string `json:"email"`
	Status string `json:"status"`
}

func (h handler) register(w http.ResponseWriter, r *http.Request) {
	var in struct {
		OrgID string `json:"org_id"`
		Email string `json:"email"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, maxBodyLen)).Decode(&in); err != nil {
		h.writeError(w, r, http.StatusBadRequest, "invalid", "本文を読めません", err)
		return
	}
	email := strings.ToLower(strings.TrimSpace(in.Email))
	if local, host, ok := strings.Cut(email, "@"); !ok || local == "" || host == "" || len(email) > maxEmailLen {
		h.writeError(w, r, http.StatusBadRequest, "invalid", "メールの形式が正しくありません", nil)
		return
	}
	if !h.KnownOrg(in.OrgID) {
		h.writeError(w, r, http.StatusBadRequest, "invalid", "組織の上流の IdP の設定がありません", nil)
		return
	}
	m, created, err := h.Staff.Register(r.Context(), login.StaffMember{
		ID: h.NewID(), OrgID: in.OrgID, Email: email, Status: login.StatusActive,
	})
	if err != nil {
		h.writeError(w, r, http.StatusInternalServerError, "internal", "職員を登録できません", err)
		return
	}
	if m.Status != login.StatusActive {
		h.writeError(w, r, http.StatusConflict, "suspended", "同じメールの職員が止められています", ErrSuspended)
		return
	}
	code := http.StatusOK
	if created {
		code = http.StatusCreated
		h.Logger.InfoContext(r.Context(), "職員を登録した", "staff_id", m.ID, "org_id", m.OrgID)
	}
	writeJSON(h.Logger, w, code, staffBody{ID: m.ID, OrgID: m.OrgID, Email: m.Email, Status: m.Status})
}

func (h handler) delete(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	switch err := h.Staff.Delete(r.Context(), id); {
	case errors.Is(err, login.ErrNotFound):
		h.writeError(w, r, http.StatusNotFound, "not_found", "職員がいません", nil)
	case errors.Is(err, ErrLinked):
		h.writeError(w, r, http.StatusConflict, "linked", "上流のアカウントを結び付けた職員は消せません", err)
	case err != nil:
		h.writeError(w, r, http.StatusInternalServerError, "internal", "職員を消せません", err)
	default:
		h.Logger.InfoContext(r.Context(), "職員を消した", "staff_id", id)
		w.WriteHeader(http.StatusNoContent)
	}
}

// suspend は、職員を止めてから、Hydra のログインのセッションと同意を取り消す。取り消しに失敗したら 502 を返す。
// 職員は止めたままなので、token_hook がトークンを拒む。呼び出し側は同じ要求を送り直して、取り消しをやり直せる。
func (h handler) suspend(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	id := r.PathValue("id")
	switch err := h.Staff.Suspend(ctx, id); {
	case errors.Is(err, login.ErrNotFound):
		h.writeError(w, r, http.StatusNotFound, "not_found", "職員がいません", nil)
		return
	case err != nil:
		h.writeError(w, r, http.StatusInternalServerError, "internal", "職員を止められません", err)
		return
	}
	h.Logger.InfoContext(ctx, "職員を止めた", "staff_id", id)
	if err := h.Hydra.RevokeLoginSessions(ctx, id); err != nil {
		h.writeError(w, r, http.StatusBadGateway, "revoke_failed", "ログインのセッションを取り消せません", err)
		return
	}
	if err := h.Hydra.RevokeConsentSessions(ctx, id); err != nil {
		h.writeError(w, r, http.StatusBadGateway, "revoke_failed", "同意を取り消せません", err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// tokenHookRequest は、Hydra が token_hook に送る本文のうち、ブローカーが読む値である。
// session は Hydra の oauth2.Session で、id_token の下は ID token の元になるセッションである。
// auth_time は、Hydra がログインの accept を受けた時刻で、refresh でも最初のログインの時刻のまま変わらない。
type tokenHookRequest struct {
	Session struct {
		IDToken struct {
			Subject string `json:"subject"`
			Claims  struct {
				Subject  string    `json:"sub"`
				AuthTime time.Time `json:"auth_time"`
			} `json:"id_token_claims"`
		} `json:"id_token"`
	} `json:"session"`
	Request struct {
		ClientID   string   `json:"client_id"`
		GrantTypes []string `json:"grant_types"`
	} `json:"request"`
}

// tokenHook は、Hydra がトークンを発行する前に呼ぶ。発行してよければ 204 を返し、Hydra はセッションを変えずに発行する。
// 拒むときは 403 を返し、Hydra はトークンの要求に access_denied を返す。
// 200 を返すと Hydra は access token の追加のクレームを本文で置き換え、同意で入れた org_id が消えるので、200 は返さない。
func (h handler) tokenHook(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	if subtle.ConstantTimeCompare([]byte(r.Header.Get(TokenHookKeyHeader)), []byte(h.TokenHookKey)) != 1 {
		h.writeError(w, r, http.StatusUnauthorized, "unauthenticated", "token_hook の鍵が正しくありません", nil)
		return
	}
	var in tokenHookRequest
	if err := json.NewDecoder(io.LimitReader(r.Body, maxHookBodyLen)).Decode(&in); err != nil {
		h.writeError(w, r, http.StatusBadRequest, "invalid", "本文を読めません", err)
		return
	}
	// client credentials のトークンは職員のものでなく、予定の API が内部の API を呼ぶのに使う
	if slices.Equal(in.Request.GrantTypes, []string{"client_credentials"}) {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	deny := func(reason string, err error) {
		h.Logger.WarnContext(ctx, "トークンの発行を拒む", "reason", reason, "client_id", in.Request.ClientID,
			"grant_types", in.Request.GrantTypes, "error", err)
		w.WriteHeader(http.StatusForbidden)
	}
	sub := in.Session.IDToken.Subject
	if sub == "" {
		sub = in.Session.IDToken.Claims.Subject
	}
	if sub == "" {
		deny("職員の ID が無い", nil)
		return
	}
	m, err := h.Staff.Get(ctx, sub)
	if errors.Is(err, login.ErrNotFound) {
		deny("職員がいない", nil)
		return
	}
	if err != nil {
		h.writeError(w, r, http.StatusInternalServerError, "internal", "職員を引けません", err)
		return
	}
	if m.Status != login.StatusActive {
		deny("職員が止められている", nil)
		return
	}
	auth := in.Session.IDToken.Claims.AuthTime
	if auth.IsZero() {
		deny("ログインの時刻が無い", nil)
		return
	}
	if h.Now().Sub(auth) > MaxAuthAge {
		deny("上流でのログインから時間が経ちすぎた", nil)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

type errorBody struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

func (h handler) writeError(w http.ResponseWriter, r *http.Request, code int, kind, msg string, err error) {
	level := slog.LevelWarn
	if code >= http.StatusInternalServerError {
		level = slog.LevelError
	}
	h.Logger.Log(r.Context(), level, "内部の API がエラーを返す", "status", code, "reason", msg, "error", err)
	writeJSON(h.Logger, w, code, errorBody{Code: kind, Message: msg})
}

func writeJSON(logger *slog.Logger, w http.ResponseWriter, code int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	if err := json.NewEncoder(w).Encode(body); err != nil {
		logger.Error("レスポンスを書けない", "error", err)
	}
}
