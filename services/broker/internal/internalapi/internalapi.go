// Package internalapi は、ブローカーの内部の API を持つ（ADR-0017）。
//
// 職員の登録、有効化、削除、停止は、予定の API が職員の管理の権限を確認してから呼ぶ。Hydra の client credentials の
// access token（aud は broker）のうち、許したクライアントのものだけを受ける。Hydra の oauth2.token_hook は、
// Hydra が token_hook の設定のヘッダーで呼ぶ。ログインの画面と別のポートで待ち受け、ブラウザに開かない。
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

	"github.com/Fukuemon/buddy/services/broker/internal/staff"
)

// TokenHookKeyHeader は、Hydra が token_hook を呼ぶときに、token_hook の鍵を入れるヘッダーである。
const TokenHookKeyHeader = "Token-Hook-Key"

const (
	maxBodyLen = 1 << 16
	// maxHookBodyLen は、token_hook の本文を読む上限である。本文は Hydra のセッションで、クレームの数で大きくなる。
	maxHookBodyLen = 1 << 20
)

// Store は、ブローカーの職員を読み書きする。
type Store interface {
	// Get は、ID が id の職員を返す。いなければ staff.ErrNotFound を返す。
	Get(ctx context.Context, id string) (staff.Member, error)
	// Register は、m のメールの職員がいなければ m を書き、書いた職員と true を返す。メールは全ての事業所で一意である。
	// 同じ事業所に同じメールの職員がいれば、書かずにその職員と false を返す。その職員が止められていれば staff.ErrSuspended を、
	// ほかの事業所にいれば staff.ErrEmailTaken を返す。
	Register(ctx context.Context, m staff.Member) (staff.Member, bool, error)
	// Activate は、登録の途中の職員 id を有効にする。有効な職員を有効にしても成功する。いなければ staff.ErrNotFound を、
	// 止めた職員なら staff.ErrSuspended を、退職した職員なら staff.ErrRetired を返す。
	Activate(ctx context.Context, id string) error
	// Delete は、登録の途中の職員 id を消す。いなければ staff.ErrNotFound を、登録の途中でなければ staff.ErrNotPending を返す。
	Delete(ctx context.Context, id string) error
	// Suspend は、職員 id を止める。止めた職員を止めても成功する。いなければ staff.ErrNotFound を、
	// 退職した職員なら staff.ErrRetired を返す。
	Suspend(ctx context.Context, id string) error
	// Resume は、止めた職員 id を有効に戻す。上流のアカウントの結び付けは残す。有効な職員を戻しても成功する。
	// いなければ staff.ErrNotFound を、退職した職員なら staff.ErrRetired を、登録の途中の職員なら staff.ErrNotSuspended を返す。
	Resume(ctx context.Context, id string) error
	// Retire は、職員 id を退職にし、メールと上流のアカウントを消す。退職した職員を退職にしても成功する。
	// いなければ staff.ErrNotFound を返す。
	Retire(ctx context.Context, id string) error
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
	email := staff.NormalizeEmail(in.Email)
	if !staff.IsValidEmail(email) {
		h.writeError(w, r, http.StatusBadRequest, "invalid", "メールの形式が正しくありません", nil)
		return
	}
	if !h.KnownOrg(in.OrgID) {
		h.writeError(w, r, http.StatusBadRequest, "invalid", "組織の上流の IdP の設定がありません", nil)
		return
	}
	m, created, err := h.Staff.Register(r.Context(), staff.Member{
		ID: h.NewID(), OrgID: in.OrgID, Email: email, Status: staff.StatusPending,
	})
	if err != nil {
		h.writeStoreError(w, r, err, "職員を登録できません")
		return
	}
	code := http.StatusOK
	if created {
		code = http.StatusCreated
		h.Logger.InfoContext(r.Context(), "職員を登録した", "staff_id", m.ID, "org_id", m.OrgID)
	}
	WriteJSON(h.Logger, w, code, staffBody{ID: m.ID, OrgID: m.OrgID, Email: m.Email, Status: m.Status})
}

func (h handler) activate(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if err := h.Staff.Activate(r.Context(), id); err != nil {
		h.writeStoreError(w, r, err, "職員を有効にできません")
		return
	}
	h.Logger.InfoContext(r.Context(), "職員を有効にした", "staff_id", id)
	w.WriteHeader(http.StatusNoContent)
}

func (h handler) delete(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if err := h.Staff.Delete(r.Context(), id); err != nil {
		h.writeStoreError(w, r, err, "職員を消せません")
		return
	}
	h.Logger.InfoContext(r.Context(), "職員を消した", "staff_id", id)
	w.WriteHeader(http.StatusNoContent)
}

// suspend は、職員を止めてから、Hydra のログインのセッションと同意を取り消す。取り消しに失敗したら、code が
// revoke_failed の 502 を返し、停止は書いたことを示す。職員は止めたままなので、token_hook がトークンを拒む。
// 呼び出し側は同じ要求を送り直して、取り消しをやり直せる。
func (h handler) suspend(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	id := r.PathValue("id")
	if err := h.Staff.Suspend(ctx, id); err != nil {
		h.writeStoreError(w, r, err, "職員を止められません")
		return
	}
	h.Logger.InfoContext(ctx, "職員を止めた", "staff_id", id)
	h.revoke(w, r, id)
}

// resume は、止めた職員を有効に戻す。上流のアカウントの結び付けは残すので、職員は同じ上流のアカウントでログインできる。
func (h handler) resume(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if err := h.Staff.Resume(r.Context(), id); err != nil {
		h.writeStoreError(w, r, err, "職員を戻せません")
		return
	}
	h.Logger.InfoContext(r.Context(), "職員を戻した", "staff_id", id)
	w.WriteHeader(http.StatusNoContent)
}

// retire は、職員を退職にしてメールと上流のアカウントを消してから、Hydra のログインのセッションと同意を取り消す。
// 取り消しに失敗したときは suspend と同じく revoke_failed の 502 を返し、送り直しで取り消しをやり直させる。
func (h handler) retire(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	id := r.PathValue("id")
	if err := h.Staff.Retire(ctx, id); err != nil {
		h.writeStoreError(w, r, err, "職員を退職にできません")
		return
	}
	h.Logger.InfoContext(ctx, "職員を退職にした", "staff_id", id)
	h.revoke(w, r, id)
}

// revoke は、職員 id の Hydra のログインのセッションと同意を取り消し、204 を返す。取り消せなければ revoke_failed の 502 を返す。
func (h handler) revoke(w http.ResponseWriter, r *http.Request, id string) {
	ctx := r.Context()
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
	deny := func(reason string, err error) {
		h.Logger.WarnContext(ctx, "トークンの発行を拒む", "reason", reason, "client_id", in.Request.ClientID,
			"grant_types", in.Request.GrantTypes, "error", err)
		w.WriteHeader(http.StatusForbidden)
	}
	// client credentials のトークンは職員のものでなく、予定の API が内部の API を呼ぶのに使う。許したクライアントにだけ出す
	if slices.Equal(in.Request.GrantTypes, []string{"client_credentials"}) {
		if !slices.Contains(h.Clients, in.Request.ClientID) {
			deny("内部の API を呼べないクライアント", nil)
			return
		}
		w.WriteHeader(http.StatusNoContent)
		return
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
	if errors.Is(err, staff.ErrNotFound) {
		deny("職員がいない", nil)
		return
	}
	if err != nil {
		h.writeError(w, r, http.StatusInternalServerError, "internal", "職員を引けません", err)
		return
	}
	if !m.CanLogin() {
		deny("職員が有効でない", errors.New(m.Status))
		return
	}
	auth := in.Session.IDToken.Claims.AuthTime
	if auth.IsZero() {
		deny("ログインの時刻が無い", nil)
		return
	}
	if h.Now().Sub(auth) > staff.SessionMaxAge {
		deny("上流でのログインから時間が経ちすぎた", nil)
		return
	}
	w.WriteHeader(http.StatusNoContent)
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
