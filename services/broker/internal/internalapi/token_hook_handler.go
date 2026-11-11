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
	"time"

	"github.com/Fukuemon/buddy/services/broker/internal/staff"
)

// DefaultTokenHookDBTimeout は、token_hook が職員を DB から引くのを待つ上限である（ADR-0044）。
// Hydra は hook が 2xx と 403 以外を返すと、1 秒と 2 秒の間を置いて 3 回まで呼ぶので、DB が答えなくても約 9 秒で失敗が決まる。
const DefaultTokenHookDBTimeout = 2 * time.Second

// tokenHook の結果の名前である。ログの result に出す。
const (
	hookAllowed = "allowed"
	hookDenied  = "denied"
	hookFailed  = "failed"
)

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

// hookOutcome は、token_hook の 1 回の判定である。code は返す状態コード、reason はログに出す理由、err は原因のエラーである。
type hookOutcome struct {
	code   int
	reason string
	err    error
}

// tokenHook は、Hydra がトークンを発行する前に呼ぶ。発行してよければ 204 を返し、Hydra はセッションを変えずに発行する。
// 拒むときは 403 を返し、Hydra はトークンの要求に access_denied を返す。
// 200 を返すと Hydra は access token の追加のクレームを本文で置き換え、同意で入れた org_id が消えるので、200 は返さない。
// 呼び出しごとに、結果（allowed、denied、failed）と所要の時間をログに 1 行出す。
type tokenHook struct {
	logger       *slog.Logger
	staff        Store
	clients      []string
	tokenHookKey string
	dbTimeout    time.Duration
	now          func() time.Time
}

func (h tokenHook) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	start := time.Now()
	var in tokenHookRequest
	out := h.decide(r, &in)
	switch out.code {
	case http.StatusNoContent, http.StatusForbidden:
		w.WriteHeader(out.code)
	default:
		WriteJSON(h.logger, w, out.code, ErrorBody{Code: toErrorCode(out.code), Message: out.reason})
	}
	result, level := hookFailed, slog.LevelError
	switch {
	case out.code == http.StatusNoContent:
		result, level = hookAllowed, slog.LevelInfo
	case out.code == http.StatusForbidden:
		result, level = hookDenied, slog.LevelWarn
	case out.code < http.StatusInternalServerError:
		level = slog.LevelWarn
	}
	h.logger.Log(r.Context(), level, "token_hook の結果", "result", result, "status", out.code,
		"duration_ms", time.Since(start).Milliseconds(), "reason", out.reason,
		"client_id", in.Request.ClientID, "grant_types", in.Request.GrantTypes, "error", out.err)
}

// decide は、鍵、本文、client credentials、職員の取得、状態、上流でのログインからの時間の順に判定する。
// 職員を DB から引くのは h.dbTimeout まで待ち、過ぎれば 500 にする。
func (h tokenHook) decide(r *http.Request, in *tokenHookRequest) hookOutcome {
	if subtle.ConstantTimeCompare([]byte(r.Header.Get(TokenHookKeyHeader)), []byte(h.tokenHookKey)) != 1 {
		return hookOutcome{code: http.StatusUnauthorized, reason: "token_hook の鍵が正しくありません"}
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, maxHookBodyLen)).Decode(in); err != nil {
		return hookOutcome{code: http.StatusBadRequest, reason: "本文を読めません", err: err}
	}
	deny := func(reason string, err error) hookOutcome {
		return hookOutcome{code: http.StatusForbidden, reason: reason, err: err}
	}
	// client credentials のトークンは職員のものでなく、予定の API が内部の API を呼ぶのに使う。許したクライアントにだけ出す
	if slices.Equal(in.Request.GrantTypes, []string{"client_credentials"}) {
		if !slices.Contains(h.clients, in.Request.ClientID) {
			return deny("内部の API を呼べないクライアント", nil)
		}
		return hookOutcome{code: http.StatusNoContent}
	}
	sub := in.Session.IDToken.Subject
	if sub == "" {
		sub = in.Session.IDToken.Claims.Subject
	}
	if sub == "" {
		return deny("職員の ID が無い", nil)
	}
	ctx, cancel := context.WithTimeout(r.Context(), h.dbTimeout)
	defer cancel()
	m, err := h.staff.Get(ctx, sub)
	if errors.Is(err, staff.ErrNotFound) {
		return deny("職員がいない", nil)
	}
	if err != nil {
		return hookOutcome{code: http.StatusInternalServerError, reason: "職員を読めません", err: err}
	}
	if !m.CanLogin() {
		return deny("職員が有効でない", errors.New(m.Status))
	}
	auth := in.Session.IDToken.Claims.AuthTime
	if auth.IsZero() {
		return deny("ログインの時刻が無い", nil)
	}
	if h.now().Sub(auth) > staff.SessionMaxAge {
		return deny("上流でのログインから時間が経ちすぎた", nil)
	}
	return hookOutcome{code: http.StatusNoContent}
}

// toErrorCode は、token_hook の失敗の状態コードを、ErrorBody の code にする。
func toErrorCode(status int) string {
	switch status {
	case http.StatusUnauthorized:
		return "unauthenticated"
	case http.StatusBadRequest:
		return "invalid"
	}
	return "internal"
}
