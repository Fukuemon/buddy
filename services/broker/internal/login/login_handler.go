package login

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"

	"github.com/Fukuemon/buddy/services/broker/internal/hydra"
	"github.com/Fukuemon/buddy/services/broker/internal/staff"
	"github.com/Fukuemon/buddy/services/broker/internal/upstream"
)

// showLogin は、GET /login を受け、ログインの画面を出すか、覚えているログインを受け入れる。
type showLogin struct {
	logger         *slog.Logger
	staff          Staff
	hydra          Hydra
	limiter        *Limiter
	clientIPHeader string
}

func (h showLogin) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	if !admitClient(h.logger, h.limiter, h.clientIPHeader, fail, w, r) {
		return
	}
	challenge := r.URL.Query().Get("login_challenge")
	if challenge == "" {
		fail(h.logger, w, r, http.StatusBadRequest, "login_challenge がない", nil)
		return
	}
	req, err := h.hydra.LoginRequest(ctx, challenge)
	if err != nil {
		fail(h.logger, w, r, challengeReadStatus(err), "ログインの要求を読めない", err)
		return
	}
	if !req.Skip {
		renderLogin(w, h.logger, challenge)
		return
	}
	// Hydra がログインのセッションを保っているときも、有効でない職員には出さない
	m, err := h.staff.Get(ctx, req.Subject)
	if err != nil && !errors.Is(err, staff.ErrNotFound) {
		rejectAs(h.logger, h.hydra, w, r, challenge, hydra.ServerError, "Hydra が保つセッションの職員を引けない", err)
		return
	}
	if err != nil || !m.CanLogin() {
		reject(h.logger, h.hydra, w, r, challenge, "Hydra が保つセッションの職員が有効でない", err)
		return
	}
	accept(h.logger, h.hydra, w, r, challenge, m.ID)
}

// submitEmail は、POST /login を受け、入れたメールの職員を引いて、上流の IdP のログインへ送る。
type submitEmail struct {
	logger           *slog.Logger
	staff            Staff
	hydra            Hydra
	upstream         Upstream
	limiter          *Limiter
	emailLimiter     *Limiter
	clientIPHeader   string
	usesSecureCookie bool
	signer           cookieSigner
}

func (h submitEmail) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	if !admitClient(h.logger, h.limiter, h.clientIPHeader, fail, w, r) {
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxFormLen)
	if err := r.ParseForm(); err != nil {
		code := http.StatusBadRequest
		if _, ok := errors.AsType[*http.MaxBytesError](err); ok {
			code = http.StatusRequestEntityTooLarge
		}
		fail(h.logger, w, r, code, "本文を読めない", err)
		return
	}
	challenge := r.PostFormValue("login_challenge")
	if challenge == "" {
		fail(h.logger, w, r, http.StatusBadRequest, "login_challenge がない", nil)
		return
	}
	// 形の違うメールは職員にいないので、Hydra に問い合わせず、メールごとの上限でも数えない
	email := staff.NormalizeEmail(r.PostFormValue("email"))
	if !staff.IsValidEmail(email) {
		fail(h.logger, w, r, http.StatusBadRequest, "メールの形が正しくない", nil)
		return
	}
	// 使い終えたか、Hydra の知らない login_challenge では、職員を引かない
	if _, err := h.hydra.LoginRequest(ctx, challenge); err != nil {
		fail(h.logger, w, r, challengeReadStatus(err), "ログインの要求を読めない", err)
		return
	}
	if !h.emailLimiter.Allow(email) {
		rejectAs(h.logger, h.hydra, w, r, challenge, hydra.TooManyAttempts, "メールの試行の回数の上限を超えた", nil)
		return
	}
	found, err := h.staff.FindByEmail(ctx, email)
	if err != nil {
		fail(h.logger, w, r, http.StatusInternalServerError, "職員を引けない", err)
		return
	}
	// 同じメールの職員が 2 つの事業所にいると、どちらの上流の IdP へリダイレクトするかを決められない
	if len(found) != 1 || !found[0].CanLogin() {
		reject(h.logger, h.hydra, w, r, challenge, "メールに当たる有効な職員が 1 人でない", nil)
		return
	}
	m := found[0]
	p := pending{Challenge: challenge, StaffID: m.ID, Attempt: upstream.NewAttempt(), IssuedAt: now().Unix()}
	to, err := h.upstream.AuthURL(ctx, m.OrgID, p.Attempt, m.Email)
	if err != nil {
		fail(h.logger, w, r, http.StatusBadGateway, "上流の IdP へリダイレクトできない", err)
		return
	}
	value, err := json.Marshal(p)
	if err != nil {
		fail(h.logger, w, r, http.StatusInternalServerError, "ログインの途中の値を書けない", err)
		return
	}
	setCookie(h.usesSecureCookie, w, h.signer.sign(value), cookieMaxAge)
	http.Redirect(w, r, to, http.StatusSeeOther)
}

// callback は、GET /login/callback を受け、上流の IdP の主張を職員と照合して、ログインを受け入れるか拒む。
type callback struct {
	logger           *slog.Logger
	staff            Staff
	hydra            Hydra
	upstream         Upstream
	limiter          *Limiter
	clientIPHeader   string
	usesSecureCookie bool
	signer           cookieSigner
}

func (h callback) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	setCookie(h.usesSecureCookie, w, "", -1)
	if !admitClient(h.logger, h.limiter, h.clientIPHeader, fail, w, r) {
		return
	}
	p, err := readPending(h.signer, r)
	if err != nil {
		fail(h.logger, w, r, http.StatusBadRequest, "ログインの途中の値がない", err)
		return
	}
	q := r.URL.Query()
	if q.Get("state") != p.Attempt.State {
		fail(h.logger, w, r, http.StatusBadRequest, "state が違う", nil)
		return
	}
	if e := q.Get("error"); e != "" {
		rejectAs(h.logger, h.hydra, w, r, p.Challenge, hydra.LoginInterrupted, "上流の IdP がログインを拒んだ", fmt.Errorf("upstream error %q", e))
		return
	}
	m, err := h.staff.Get(ctx, p.StaffID)
	if err != nil {
		rejectAs(h.logger, h.hydra, w, r, p.Challenge, hydra.ServerError, "職員を引けない", err)
		return
	}
	// cookie の職員の ID は署名で守るので、ID token を検証する前に状態を見る。ログインの途中に休職か退職になった職員にも、
	// メールを入れたときと同じ reject を返す。退職した職員はメールと上流のアカウントを持たず、ID token と照合できないためである
	if !m.CanLogin() {
		reject(h.logger, h.hydra, w, r, p.Challenge, "職員が有効でない", nil)
		return
	}
	id, err := h.upstream.Exchange(ctx, m.OrgID, q.Get("code"), q.Get("iss"), p.Attempt)
	if err != nil {
		rejectAs(h.logger, h.hydra, w, r, p.Challenge, hydra.ServerError, "上流の IdP の ID token を検証できない", err)
		return
	}
	if body, reason := h.match(ctx, m, id); reason != "" {
		rejectAs(h.logger, h.hydra, w, r, p.Challenge, body, reason, nil)
		return
	}
	accept(h.logger, h.hydra, w, r, p.Challenge, m.ID)
}

// match は、上流の IdP の主張 id が職員 m のものかを確認し、違えば reject の本文と理由を返す。
// 結び付け済みの職員は iss と sub で照合する。まだの職員は、確認済みのメールが登録と同じときだけ結び付ける。
//
// m は有効な職員である（呼ぶ側が確認する）。結び付けの間に有効でなくなった職員は hydra.AccessDenied で拒む。
func (h callback) match(ctx context.Context, m staff.Member, id upstream.Identity) (hydra.Rejection, string) {
	got := staff.UpstreamAccount{Issuer: id.Issuer, Subject: id.Subject}
	if m.Upstream != (staff.UpstreamAccount{}) {
		if m.Upstream != got {
			return hydra.AccountMismatch, "結び付けた上流のアカウントと違う"
		}
		return hydra.Rejection{}, ""
	}
	if !id.EmailVerified {
		return hydra.AccountMismatch, "上流のメールが確認済みでない"
	}
	if staff.NormalizeEmail(id.Email) != m.Email {
		return hydra.AccountMismatch, "上流のメールが登録のメールと違う"
	}
	err := h.staff.Link(ctx, m.ID, got)
	if errors.Is(err, staff.ErrConflict) {
		// 同じ上流のアカウントで同時に初めてログインすると、先に結び付けたログインのほかは staff.ErrConflict になる。
		// 読み直して、この職員に同じアカウントが結び付いていれば受け入れる
		cur, err := h.staff.Get(ctx, m.ID)
		switch {
		case err != nil:
			return hydra.ServerError, "上流のアカウントを結び付けられない"
		case !cur.CanLogin():
			return hydra.AccessDenied, "職員が有効でない"
		case cur.Upstream == got:
			return hydra.Rejection{}, ""
		}
		return hydra.AccountMismatch, "ほかの結び付きと重なり、上流のアカウントを結び付けられない"
	}
	if err != nil {
		h.logger.ErrorContext(ctx, "上流のアカウントを結び付けられない", "staff_id", m.ID, "error", err)
		return hydra.ServerError, "上流のアカウントを結び付けられない"
	}
	h.logger.InfoContext(ctx, "上流のアカウントを結び付けた", "staff_id", m.ID, "iss", id.Issuer)
	return hydra.Rejection{}, ""
}
