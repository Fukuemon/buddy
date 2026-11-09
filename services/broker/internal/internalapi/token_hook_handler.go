package internalapi

import (
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
type tokenHook struct {
	logger       *slog.Logger
	staff        Store
	clients      []string
	tokenHookKey string
	now          func() time.Time
}

func (h tokenHook) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	if subtle.ConstantTimeCompare([]byte(r.Header.Get(TokenHookKeyHeader)), []byte(h.tokenHookKey)) != 1 {
		writeError(h.logger, w, r, http.StatusUnauthorized, "unauthenticated", "token_hook の鍵が正しくありません", nil)
		return
	}
	var in tokenHookRequest
	if err := json.NewDecoder(io.LimitReader(r.Body, maxHookBodyLen)).Decode(&in); err != nil {
		writeError(h.logger, w, r, http.StatusBadRequest, "invalid", "本文を読めません", err)
		return
	}
	deny := func(reason string, err error) {
		h.logger.WarnContext(ctx, "トークンの発行を拒む", "reason", reason, "client_id", in.Request.ClientID,
			"grant_types", in.Request.GrantTypes, "error", err)
		w.WriteHeader(http.StatusForbidden)
	}
	// client credentials のトークンは職員のものでなく、予定の API が内部の API を呼ぶのに使う。許したクライアントにだけ出す
	if slices.Equal(in.Request.GrantTypes, []string{"client_credentials"}) {
		if !slices.Contains(h.clients, in.Request.ClientID) {
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
	m, err := h.staff.Get(ctx, sub)
	if errors.Is(err, staff.ErrNotFound) {
		deny("職員がいない", nil)
		return
	}
	if err != nil {
		writeError(h.logger, w, r, http.StatusInternalServerError, "internal", "職員を引けません", err)
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
	if h.now().Sub(auth) > staff.SessionMaxAge {
		deny("上流でのログインから時間が経ちすぎた", nil)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
