package login

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"

	"github.com/Fukuemon/buddy/services/broker/internal/hydra"
	"github.com/Fukuemon/buddy/services/broker/internal/staff"
	"github.com/Fukuemon/buddy/services/broker/internal/upstream"
)

func (h handler) showLogin(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	if !h.admitClient(w, r) {
		return
	}
	challenge := r.URL.Query().Get("login_challenge")
	if challenge == "" {
		h.fail(w, r, http.StatusBadRequest, "login_challenge がない", nil)
		return
	}
	req, err := h.Hydra.LoginRequest(ctx, challenge)
	if err != nil {
		h.fail(w, r, http.StatusBadRequest, "ログインの要求を読めない", err)
		return
	}
	if !req.Skip {
		renderLogin(w, h.Logger, challenge)
		return
	}
	// Hydra がログインのセッションを保っているときも、有効でない職員には出さない
	m, err := h.Staff.Get(ctx, req.Subject)
	if err != nil || !m.CanLogin() {
		h.reject(w, r, challenge, "Hydra が保つセッションの職員が有効でない", err)
		return
	}
	h.accept(w, r, challenge, m.ID)
}

func (h handler) submitEmail(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	if !h.admitClient(w, r) {
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxFormLen)
	if err := r.ParseForm(); err != nil {
		code := http.StatusBadRequest
		if _, ok := errors.AsType[*http.MaxBytesError](err); ok {
			code = http.StatusRequestEntityTooLarge
		}
		h.fail(w, r, code, "本文を読めない", err)
		return
	}
	challenge := r.PostFormValue("login_challenge")
	if challenge == "" {
		h.fail(w, r, http.StatusBadRequest, "login_challenge がない", nil)
		return
	}
	// 形の違うメールは職員にいないので、Hydra に問い合わせず、メールごとの上限でも数えない
	email := staff.NormalizeEmail(r.PostFormValue("email"))
	if !staff.IsValidEmail(email) {
		h.fail(w, r, http.StatusBadRequest, "メールの形が正しくない", nil)
		return
	}
	// 使い終えたか、Hydra の知らない login_challenge では、職員を引かない
	if _, err := h.Hydra.LoginRequest(ctx, challenge); err != nil {
		h.fail(w, r, http.StatusBadRequest, "ログインの要求を読めない", err)
		return
	}
	if !h.EmailLimiter.Allow(email) {
		h.rejectAs(w, r, challenge, hydra.TooManyAttempts, "メールの試行の回数の上限を超えた", nil)
		return
	}
	found, err := h.Staff.FindByEmail(ctx, email)
	if err != nil {
		h.fail(w, r, http.StatusInternalServerError, "職員を引けない", err)
		return
	}
	// 同じメールの職員が 2 つの事業所にいると、どちらの上流の IdP へリダイレクトするかを決められない
	if len(found) != 1 || !found[0].CanLogin() {
		h.reject(w, r, challenge, "メールに当たる有効な職員が 1 人でない", nil)
		return
	}
	m := found[0]
	p := pending{Challenge: challenge, StaffID: m.ID, Attempt: upstream.NewAttempt()}
	to, err := h.Upstream.AuthURL(ctx, m.OrgID, p.Attempt, m.Email)
	if err != nil {
		h.fail(w, r, http.StatusBadGateway, "上流の IdP へリダイレクトできない", err)
		return
	}
	value, err := json.Marshal(p)
	if err != nil {
		h.fail(w, r, http.StatusInternalServerError, "ログインの途中の値を書けない", err)
		return
	}
	h.setCookie(w, base64.RawURLEncoding.EncodeToString(value), cookieMaxAge)
	http.Redirect(w, r, to, http.StatusSeeOther)
}

func (h handler) callback(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	h.setCookie(w, "", -1)
	p, err := readPending(r)
	if err != nil {
		h.fail(w, r, http.StatusBadRequest, "ログインの途中の値がない", err)
		return
	}
	q := r.URL.Query()
	if q.Get("state") != p.Attempt.State {
		h.fail(w, r, http.StatusBadRequest, "state が違う", nil)
		return
	}
	if e := q.Get("error"); e != "" {
		h.reject(w, r, p.Challenge, "上流の IdP がログインを拒んだ", fmt.Errorf("upstream error %q", e))
		return
	}
	m, err := h.Staff.Get(ctx, p.StaffID)
	if err != nil {
		h.reject(w, r, p.Challenge, "職員を引けない", err)
		return
	}
	id, err := h.Upstream.Exchange(ctx, m.OrgID, q.Get("code"), q.Get("iss"), p.Attempt)
	if err != nil {
		h.reject(w, r, p.Challenge, "上流の IdP の ID token を検証できない", err)
		return
	}
	if reason := h.match(ctx, m, id); reason != "" {
		h.reject(w, r, p.Challenge, reason, nil)
		return
	}
	h.accept(w, r, p.Challenge, m.ID)
}

// match は、上流の IdP の主張 id が職員 m のものかを確認し、違えば理由を返す。
// 結び付け済みの職員は iss と sub で照合する。まだの職員は、確認済みのメールが登録と同じときだけ結び付ける。
func (h handler) match(ctx context.Context, m staff.Member, id upstream.Identity) string {
	if !m.CanLogin() {
		return "職員が有効でない"
	}
	got := staff.UpstreamAccount{Issuer: id.Issuer, Subject: id.Subject}
	if m.Upstream != (staff.UpstreamAccount{}) {
		if m.Upstream != got {
			return "結び付けた上流のアカウントと違う"
		}
		return ""
	}
	if !id.EmailVerified {
		return "上流のメールが確認済みでない"
	}
	if staff.NormalizeEmail(id.Email) != m.Email {
		return "上流のメールが登録のメールと違う"
	}
	err := h.Staff.Link(ctx, m.ID, got)
	if errors.Is(err, staff.ErrConflict) {
		// 同じ上流のアカウントで同時に初めてログインすると、先に結び付けたログインのほかは staff.ErrConflict になる。
		// 読み直して、この職員に同じアカウントが結び付いていれば受け入れる
		if cur, err := h.Staff.Get(ctx, m.ID); err == nil && cur.CanLogin() && cur.Upstream == got {
			return ""
		}
		return "上流のアカウントを結び付けられない"
	}
	if err != nil {
		h.Logger.ErrorContext(ctx, "上流のアカウントを結び付けられない", "staff_id", m.ID, "error", err)
		return "上流のアカウントを結び付けられない"
	}
	h.Logger.InfoContext(ctx, "上流のアカウントを結び付けた", "staff_id", m.ID, "iss", id.Issuer)
	return ""
}
