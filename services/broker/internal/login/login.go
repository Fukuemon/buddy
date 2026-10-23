// Package login は、ブローカーのログインと同意とログアウトの画面を持つ（ADR-0016、ADR-0017）。
//
// ログインの画面で入れたメールから職員と事業所を決め、その事業所の上流の IdP へ転送する。上流の IdP のコールバックで
// 職員を照らし、Hydra のログインの要求を accept するか reject する。同意の画面は、職員の事業所の組織の ID を access token に足す。
// ログアウトの画面は、Hydra のログアウトの要求を accept する。上流の IdP のセッションは消さない。
package login

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"slices"
	"strings"

	"github.com/Fukuemon/buddy/services/broker/internal/hydra"
	"github.com/Fukuemon/buddy/services/broker/internal/upstream"
)

// rememberFor は、Hydra がログインのセッションを覚える秒数である。上流でのログインから 12 時間でトークンを拒むのと同じ長さにする。
const rememberFor = 12 * 60 * 60

// 職員の状態。有効な職員にだけトークンを出す。登録の途中の職員は、予定の API が職員を書き終えると有効になる。
const (
	StatusPending   = "pending"
	StatusActive    = "active"
	StatusSuspended = "suspended"
)

// UpstreamAccount は、職員に結び付けた上流の IdP のアカウントである。結び付けていなければ値は空である。
type UpstreamAccount struct {
	Issuer  string
	Subject string
}

// StaffMember は、ブローカーが身元を持つ職員である。
type StaffMember struct {
	ID       string
	OrgID    string
	Email    string
	Status   string
	Upstream UpstreamAccount
}

var (
	// ErrNotFound は、職員がいないことを示す。
	ErrNotFound = errors.New("職員がいない")
	// ErrConflict は、職員が既に上流のアカウントを持つか、上流のアカウントが別の職員に結び付いていることを示す。
	ErrConflict = errors.New("上流のアカウントを結び付けられない")
)

// Staff は、職員を読み、上流のアカウントを結び付ける。
type Staff interface {
	// FindByEmail は、email（小文字にそろえた値）の職員を全ての事業所から返す。いなければ空を返す。
	FindByEmail(ctx context.Context, email string) ([]StaffMember, error)
	// Get は、ID が id の職員を返す。いなければ ErrNotFound を返す。
	Get(ctx context.Context, id string) (StaffMember, error)
	// Link は、職員 staffID に上流のアカウントを結び付ける。結び付けられないときは ErrConflict を返す。
	Link(ctx context.Context, staffID string, a UpstreamAccount) error
}

// Hydra は、Hydra の admin API のログインと同意とログアウトの呼び出しである。約束は hydra.Client と同じである。
type Hydra interface {
	LoginRequest(ctx context.Context, challenge string) (hydra.LoginRequest, error)
	AcceptLogin(ctx context.Context, challenge string, body hydra.AcceptLogin) (string, error)
	RejectLogin(ctx context.Context, challenge string, body hydra.Rejection) (string, error)
	ConsentRequest(ctx context.Context, challenge string) (hydra.ConsentRequest, error)
	AcceptConsent(ctx context.Context, challenge string, body hydra.AcceptConsent) (string, error)
	RejectConsent(ctx context.Context, challenge string, body hydra.Rejection) (string, error)
	AcceptLogout(ctx context.Context, challenge string) (string, error)
}

// Upstream は、上流の IdP の RP の処理である。約束は upstream.RP と同じである。
type Upstream interface {
	AuthURL(ctx context.Context, orgID string, a upstream.Attempt, loginHint string) (string, error)
	Exchange(ctx context.Context, orgID, code, iss string, a upstream.Attempt) (upstream.Identity, error)
}

// Config は、NewHandler の設定である。
type Config struct {
	Logger   *slog.Logger
	Staff    Staff
	Hydra    Hydra
	Upstream Upstream
	// Limiter は、ログインの画面でメールを送る試行を、送り手のアドレスごとに数える。
	Limiter *Limiter
	// EmailLimiter は、ログインの画面でメールを送る試行を、入れたメールごとに数える。
	EmailLimiter *Limiter
	// ClientIPHeader は、送り手のアドレスを読む、前段のプロキシが付けるヘッダーの名前である。
	// 空なら、接続の相手のアドレスを送り手とみなす。値の読み方は clientAddr にある。
	ClientIPHeader string
	// PublicURL は、ブラウザが開くブローカーの URL である。POST /login の Origin をこの origin と比べる。
	PublicURL string
	// AutoConsentClients は、同意の画面を出さずに accept するクライアントの ID である。ほかのクライアントの同意は reject する。
	AutoConsentClients []string
	// SecureCookie が true なら、ログインの途中の cookie に Secure を付ける。
	SecureCookie bool
}

// cookieName は、上流の IdP へ転送している間の値を置く cookie である。
const cookieName = "broker_login"

// cookieMaxAge は、上流の IdP でログインし終えるのを待つ秒数である。
const cookieMaxAge = 10 * 60

// pending は、上流の IdP へ転送している間の値である。
//
// 署名しない。値を書き換えられるのはブラウザの利用者だけで、書き換えても、別のメールを入れたのと同じ結果にしかならない。
// 事業所と上流の IdP は職員の ID から DB で引き直し、ID token のメールはその職員の登録のメールと照らす。
// ログインの要求は、Hydra が自分の cookie でブラウザに結び付けている。
type pending struct {
	Challenge string           `json:"challenge"`
	StaffID   string           `json:"staff_id"`
	Attempt   upstream.Attempt `json:"attempt"`
}

type handler struct {
	Config
}

// NewHandler は、次の画面を持つ http.Handler を返す。
//   - GET /login: Hydra の login_challenge を受け、メールの入力の画面を出す
//   - POST /login: メールから職員を引き、その事業所の上流の IdP へ転送する
//   - GET /login/callback: 上流の IdP のコールバック。職員を照らし、ログインを accept か reject する
//   - GET /consent: Hydra の consent_challenge を受け、組織の ID と audience を付けて accept する
//   - GET /logout: Hydra の logout_challenge を受け、画面を出さずに accept する
//
// ほかのサイトから送られた POST は、Sec-Fetch-Site か Origin で見分けて 403 で拒む。cfg.PublicURL が URL として読めなければエラーを返す。
func NewHandler(cfg Config) (http.Handler, error) {
	h := handler{cfg}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /login", h.showLogin)
	mux.HandleFunc("POST /login", h.submitEmail)
	mux.HandleFunc("GET /login/callback", h.callback)
	mux.HandleFunc("GET /consent", h.consent)
	mux.HandleFunc("GET /logout", h.logout)

	// プロキシの後ろで Host がブラウザの開いた origin と違っても、PublicURL の origin からの POST は受ける
	cop := http.NewCrossOriginProtection()
	if cfg.PublicURL != "" {
		u, err := url.Parse(cfg.PublicURL)
		if err != nil {
			return nil, fmt.Errorf("PublicURL %q: %w", cfg.PublicURL, err)
		}
		if err := cop.AddTrustedOrigin(u.Scheme + "://" + u.Host); err != nil {
			return nil, fmt.Errorf("PublicURL %q: %w", cfg.PublicURL, err)
		}
	}
	cop.SetDenyHandler(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h.fail(w, r, http.StatusForbidden, "ほかのサイトから送られた", nil)
	}))
	return cop.Handler(mux), nil
}

func (h handler) showLogin(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	challenge := r.URL.Query().Get("login_challenge")
	if challenge == "" {
		h.fail(w, r, http.StatusBadRequest, "login_challenge がない", nil)
		return
	}
	req, err := h.Hydra.LoginRequest(ctx, challenge)
	if err != nil {
		h.fail(w, r, http.StatusBadGateway, "ログインの要求を読めない", err)
		return
	}
	if !req.Skip {
		renderLogin(w, h.Logger, challenge)
		return
	}
	// Hydra がログインのセッションを覚えているときも、止めた職員には出さない
	m, err := h.Staff.Get(ctx, req.Subject)
	if err != nil || m.Status != StatusActive {
		h.reject(w, r, challenge, "覚えたセッションの職員が有効でない", err)
		return
	}
	h.accept(w, r, challenge, m.ID)
}

func (h handler) submitEmail(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	challenge := r.PostFormValue("login_challenge")
	if challenge == "" {
		h.fail(w, r, http.StatusBadRequest, "login_challenge がない", nil)
		return
	}
	// 使い終えたか、Hydra の知らない login_challenge では、職員を引かない
	if _, err := h.Hydra.LoginRequest(ctx, challenge); err != nil {
		h.fail(w, r, http.StatusBadRequest, "ログインの要求を読めない", err)
		return
	}
	email := strings.ToLower(strings.TrimSpace(r.PostFormValue("email")))
	if !h.Limiter.Allow(clientAddr(r, h.ClientIPHeader)) {
		h.reject(w, r, challenge, "送り手のアドレスの試行の回数の上限を超えた", nil)
		return
	}
	if !h.EmailLimiter.Allow(email) {
		h.reject(w, r, challenge, "メールの試行の回数の上限を超えた", nil)
		return
	}
	found, err := h.Staff.FindByEmail(ctx, email)
	if err != nil {
		h.fail(w, r, http.StatusInternalServerError, "職員を引けない", err)
		return
	}
	// 同じメールの職員が 2 つの事業所にいると、どちらの上流の IdP へ転送するかを決められない
	if len(found) != 1 || found[0].Status != StatusActive {
		h.reject(w, r, challenge, "メールに当たる有効な職員が 1 人でない", nil)
		return
	}
	m := found[0]
	p := pending{Challenge: challenge, StaffID: m.ID, Attempt: upstream.NewAttempt()}
	to, err := h.Upstream.AuthURL(ctx, m.OrgID, p.Attempt, m.Email)
	if err != nil {
		h.fail(w, r, http.StatusBadGateway, "上流の IdP へ転送できない", err)
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
// 結び付け済みの職員は iss と sub で照らす。まだの職員は、確認済みのメールが登録と同じときだけ結び付ける。
func (h handler) match(ctx context.Context, m StaffMember, id upstream.Identity) string {
	if m.Status != StatusActive {
		return "職員が有効でない"
	}
	got := UpstreamAccount{Issuer: id.Issuer, Subject: id.Subject}
	if m.Upstream != (UpstreamAccount{}) {
		if m.Upstream != got {
			return "結び付けた上流のアカウントと違う"
		}
		return ""
	}
	if !id.EmailVerified {
		return "上流のメールが確認済みでない"
	}
	if strings.ToLower(strings.TrimSpace(id.Email)) != m.Email {
		return "上流のメールが登録のメールと違う"
	}
	err := h.Staff.Link(ctx, m.ID, got)
	if errors.Is(err, ErrConflict) {
		// 同じ上流のアカウントで同時に初めてログインすると、先に結び付けたログインのほかは ErrConflict になる。
		// 読み直して、この職員に同じアカウントが結び付いていれば受け入れる
		if cur, err := h.Staff.Get(ctx, m.ID); err == nil && cur.Status == StatusActive && cur.Upstream == got {
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

func (h handler) consent(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	challenge := r.URL.Query().Get("consent_challenge")
	if challenge == "" {
		h.fail(w, r, http.StatusBadRequest, "consent_challenge がない", nil)
		return
	}
	req, err := h.Hydra.ConsentRequest(ctx, challenge)
	if err != nil {
		h.fail(w, r, http.StatusBadGateway, "同意の要求を読めない", err)
		return
	}
	// 同意の画面を持たないので、画面を出さずに accept してよいと決めたクライアントのほかは拒む
	if !slices.Contains(h.AutoConsentClients, req.Client.ClientID) {
		h.Logger.WarnContext(ctx, "同意を拒む", "reason", "同意を自動で accept するクライアントでない", "client_id", req.Client.ClientID)
		to, err := h.Hydra.RejectConsent(ctx, challenge, hydra.AccessDenied)
		h.redirect(w, r, to, err)
		return
	}
	m, err := h.Staff.Get(ctx, req.Subject)
	if err != nil || m.Status != StatusActive {
		h.Logger.WarnContext(ctx, "同意を拒む", "reason", "職員が有効でない", "staff_id", req.Subject, "error", err)
		to, err := h.Hydra.RejectConsent(ctx, challenge, hydra.AccessDenied)
		h.redirect(w, r, to, err)
		return
	}
	to, err := h.Hydra.AcceptConsent(ctx, challenge, hydra.AcceptConsent{
		GrantScope: req.RequestedScope,
		// web のクライアントに許した audience（schedule と receipt）を、そのまま access token の aud にする（ADR-0016）
		GrantAudience: req.Client.Audience,
		Session:       hydra.Session{AccessToken: map[string]any{"org_id": m.OrgID}},
	})
	h.redirect(w, r, to, err)
}

// logout は、Hydra のログアウトの要求を accept する。確認の画面は出さない。
// web はログアウトのボタンで BFF のセッションを消してから転送してくるので、職員はもうログアウトを選んでいる。
func (h handler) logout(w http.ResponseWriter, r *http.Request) {
	challenge := r.URL.Query().Get("logout_challenge")
	if challenge == "" {
		h.failLogout(w, r, http.StatusBadRequest, "logout_challenge がない", nil)
		return
	}
	to, err := h.Hydra.AcceptLogout(r.Context(), challenge)
	if err != nil {
		h.failLogout(w, r, http.StatusBadGateway, "Hydra にログアウトを返せない", err)
		return
	}
	http.Redirect(w, r, to, http.StatusSeeOther)
}

// accept は、ログインを受け入れる。Hydra はログインのセッションを rememberFor 秒だけ覚え、その間の認可でログインの画面を出さない。
// web のログアウトは Hydra のログインのセッションを消すので、ログアウトの後のログインはログインの画面を通る。
func (h handler) accept(w http.ResponseWriter, r *http.Request, challenge, staffID string) {
	to, err := h.Hydra.AcceptLogin(r.Context(), challenge, hydra.AcceptLogin{Subject: staffID, Remember: true, RememberFor: rememberFor})
	h.redirect(w, r, to, err)
}

// reject は、ログインを拒んで web へ返す。web はログインの失敗の画面を出す。
// 理由はログにだけ書き、登録されていないメールと照らせなかった職員を、画面で区別できないようにする。
func (h handler) reject(w http.ResponseWriter, r *http.Request, challenge, reason string, cause error) {
	h.Logger.WarnContext(r.Context(), "ログインを拒む", "reason", reason, "error", cause)
	to, err := h.Hydra.RejectLogin(r.Context(), challenge, hydra.AccessDenied)
	h.redirect(w, r, to, err)
}

func (h handler) redirect(w http.ResponseWriter, r *http.Request, to string, err error) {
	if err != nil {
		h.fail(w, r, http.StatusBadGateway, "Hydra に結果を返せない", err)
		return
	}
	http.Redirect(w, r, to, http.StatusSeeOther)
}

// fail は、Hydra へ返せない失敗で、ログインの失敗の画面を出す。
func (h handler) fail(w http.ResponseWriter, r *http.Request, code int, reason string, err error) {
	level := slog.LevelWarn
	if code >= http.StatusInternalServerError {
		level = slog.LevelError
	}
	h.Logger.Log(r.Context(), level, "ログインの失敗の画面を出す", "reason", reason, "error", err)
	renderFailure(w, h.Logger, code)
}

// failLogout は、Hydra へ返せないログアウトの失敗で、ログアウトの失敗の画面を出す。
func (h handler) failLogout(w http.ResponseWriter, r *http.Request, code int, reason string, err error) {
	level := slog.LevelWarn
	if code >= http.StatusInternalServerError {
		level = slog.LevelError
	}
	h.Logger.Log(r.Context(), level, "ログアウトの失敗の画面を出す", "reason", reason, "error", err)
	render(w, h.Logger, code, "logoutFailure", nil)
}

func (h handler) setCookie(w http.ResponseWriter, value string, maxAge int) {
	http.SetCookie(w, &http.Cookie{
		Name:     cookieName,
		Value:    value,
		Path:     "/login",
		MaxAge:   maxAge,
		HttpOnly: true,
		Secure:   h.SecureCookie,
		// 上流の IdP からのコールバックは、ほかのサイトからの GET の遷移なので、Strict では cookie が届かない
		SameSite: http.SameSiteLaxMode,
	})
}

func readPending(r *http.Request) (pending, error) {
	c, err := r.Cookie(cookieName)
	if err != nil {
		return pending{}, err
	}
	raw, err := base64.RawURLEncoding.DecodeString(c.Value)
	if err != nil {
		return pending{}, err
	}
	var p pending
	if err := json.Unmarshal(raw, &p); err != nil {
		return pending{}, err
	}
	if p.Challenge == "" || p.StaffID == "" || p.Attempt.State == "" {
		return pending{}, errors.New("ログインの途中の値が欠けている")
	}
	return p, nil
}

// clientAddr は、試行を数える送り手のアドレスである。
//
// header が空なら、接続の相手のアドレスを使う。プロキシの後ろでは、プロキシのアドレスになる。
// header が空でなければ、前段のプロキシが付けたそのヘッダーの、最後の値を使う。X-Forwarded-For のように値を足していく
// ヘッダーでは、最後の値は前段のプロキシが見た送り手で、ブラウザが書いた値ではない。値が IP でなければ接続の相手のアドレスを使う。
func clientAddr(r *http.Request, header string) string {
	if values := r.Header.Values(header); header != "" && len(values) > 0 {
		last := values[len(values)-1]
		if ip, err := netip.ParseAddr(strings.TrimSpace(last[strings.LastIndex(last, ",")+1:])); err == nil {
			return ip.String()
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}
