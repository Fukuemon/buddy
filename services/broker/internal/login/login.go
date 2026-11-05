// Package login は、ブローカーのログインと同意とログアウトの画面を持つ（ADR-0015、ADR-0016）。
//
// ログインの画面で入れたメールから職員と事業所を決め、その事業所の上流の IdP へリダイレクトする。上流の IdP のコールバックで
// 職員を照合し、Hydra のログインの要求を accept するか reject する。同意の画面は、職員の事業所の組織の ID を access token に足す。
// ログアウトの画面は、Hydra のログアウトの要求を accept する。上流の IdP のセッションは消さない。
package login

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"strings"
	"time"

	"github.com/Fukuemon/buddy/services/broker/internal/hydra"
	"github.com/Fukuemon/buddy/services/broker/internal/staff"
	"github.com/Fukuemon/buddy/services/broker/internal/upstream"
)

// rememberFor は、Hydra がログインのセッションを保つ秒数である。上流でのログインからトークンを拒むまでの長さと同じにする。
const rememberFor = int(staff.SessionMaxAge / time.Second)

// Config は、NewHandler の設定である。
type Config struct {
	Logger   *slog.Logger
	Staff    Staff
	Hydra    Hydra
	Upstream Upstream
	// Limiter は、ログインの画面を開く試行（GET /login）、メールを送る試行（POST /login）、上流の IdP のコールバック
	// （GET /login/callback）、同意（GET /consent）、ログアウト（GET /logout）を、送信元の IP アドレスごとに 1 つの上限で数える。
	// IPv6 は /64 ごとに数える。
	Limiter *Limiter
	// EmailLimiter は、ログインの画面でメールを送る試行を、入れたメールごとに数える。
	EmailLimiter *Limiter
	// ClientIPHeader は、送信元の IP アドレスを読む、リバースプロキシが付けるヘッダーの名前である。
	// 空なら、接続の相手のアドレスを送信元とみなす。値の読み方は clientAddr にある。
	ClientIPHeader string
	// PublicURL は、ブラウザが開くブローカーの URL である。POST /login の Origin をこの origin と比べる。
	PublicURL string
	// AutoConsentClients は、同意の画面を出さずに accept するクライアントの ID である。ほかのクライアントの同意は reject する。
	AutoConsentClients []string
	// UsesSecureCookie が true なら、ログインの途中の cookie に Secure を付ける。
	UsesSecureCookie bool
}

// maxFormLen は、POST /login の本文を読む上限（バイト）である。login_challenge と staff.MaxEmailLen のメールが入る長さにする。
const maxFormLen = 4 << 10

// cookieName は、上流の IdP へリダイレクトしている間の値を置く cookie である。
const cookieName = "broker_login"

// cookieMaxAge は、上流の IdP でログインし終えるのを待つ秒数である。
const cookieMaxAge = 10 * 60

// pending は、上流の IdP へリダイレクトしている間の値である。
//
// 署名しない。値を書き換えられるのはブラウザの利用者だけで、書き換えても、別のメールを入れたのと同じ結果にしかならない。
// 事業所と上流の IdP は職員の ID から DB で引き直し、ID token のメールはその職員の登録のメールと照合する。
// ログインの要求は、Hydra が自分の cookie でブラウザに結び付けている。
type pending struct {
	Challenge string           `json:"challenge"`
	StaffID   string           `json:"staff_id"`
	Attempt   upstream.Attempt `json:"attempt"`
}

// Paths は、NewHandler のハンドラが受けるパスである。/login/ は、/login/callback を受けるためにある。
var Paths = []string{"/login", "/login/", "/consent", "/logout"}

// NewHandler は、次の画面を持つ http.Handler を返す。
//   - GET /login: Hydra の login_challenge を受け、メールの入力の画面を出す
//   - POST /login: メールから職員を引き、その事業所の上流の IdP へリダイレクトする
//   - GET /login/callback: 上流の IdP のコールバック。職員を照合し、ログインを accept か reject する
//   - GET /consent: Hydra の consent_challenge を受け、組織の ID と audience を付けて accept する
//   - GET /logout: Hydra の logout_challenge を受け、画面を出さずに accept する
//
// ほかのサイトから送られた POST は、Sec-Fetch-Site か Origin で見分けて 403 で拒む。cfg.PublicURL が URL として読めなければエラーを返す。
// 呼ぶ側は、Paths のパスをこのハンドラに渡す。
func NewHandler(cfg Config) (http.Handler, error) {
	mux := http.NewServeMux()
	mux.Handle("GET /login", showLogin{
		logger: cfg.Logger, staff: cfg.Staff, hydra: cfg.Hydra, limiter: cfg.Limiter, clientIPHeader: cfg.ClientIPHeader,
	})
	mux.Handle("POST /login", submitEmail{
		logger: cfg.Logger, staff: cfg.Staff, hydra: cfg.Hydra, upstream: cfg.Upstream, limiter: cfg.Limiter,
		emailLimiter: cfg.EmailLimiter, clientIPHeader: cfg.ClientIPHeader, usesSecureCookie: cfg.UsesSecureCookie,
	})
	mux.Handle("GET /login/callback", callback{
		logger: cfg.Logger, staff: cfg.Staff, hydra: cfg.Hydra, upstream: cfg.Upstream, limiter: cfg.Limiter,
		clientIPHeader: cfg.ClientIPHeader, usesSecureCookie: cfg.UsesSecureCookie,
	})
	mux.Handle("GET /consent", consent{
		logger: cfg.Logger, staff: cfg.Staff, hydra: cfg.Hydra, limiter: cfg.Limiter, clientIPHeader: cfg.ClientIPHeader,
		autoConsentClients: cfg.AutoConsentClients,
	})
	mux.Handle("GET /logout", logout{logger: cfg.Logger, hydra: cfg.Hydra, limiter: cfg.Limiter, clientIPHeader: cfg.ClientIPHeader})

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
		fail(cfg.Logger, w, r, http.StatusForbidden, "ほかのサイトから送られた", nil)
	}))
	return cop.Handler(mux), nil
}

// accept は、ログインを受け入れる。Hydra はログインのセッションを rememberFor 秒だけ保ち、その間の認可でログインの画面を出さない。
// web のログアウトは Hydra のログインのセッションを消すので、ログアウトの後のログインはログインの画面を通る。
func accept(logger *slog.Logger, admin Hydra, w http.ResponseWriter, r *http.Request, challenge, staffID string) {
	to, err := admin.AcceptLogin(r.Context(), challenge, hydra.AcceptLogin{Subject: staffID, Remember: true, RememberFor: rememberFor})
	redirect(logger, w, r, to, err)
}

// reject は、ログインを拒んで web へ返す。web はログインの失敗の画面を出す。
// 理由はログにだけ書き、登録されていないメールと照合できなかった職員を、画面で区別できないようにする。
func reject(logger *slog.Logger, admin Hydra, w http.ResponseWriter, r *http.Request, challenge, reason string, cause error) {
	rejectAs(logger, admin, w, r, challenge, hydra.AccessDenied, reason, cause)
}

// rejectAs は、ログインを body で拒んで web へ返す。body の Error が web に渡り、web が出す文を分ける。
func rejectAs(logger *slog.Logger, admin Hydra, w http.ResponseWriter, r *http.Request, challenge string, body hydra.Rejection, reason string, cause error) {
	logger.WarnContext(r.Context(), "ログインを拒む", "reason", reason, "error", cause)
	to, err := admin.RejectLogin(r.Context(), challenge, body)
	redirect(logger, w, r, to, err)
}

func redirect(logger *slog.Logger, w http.ResponseWriter, r *http.Request, to string, err error) {
	if err != nil {
		fail(logger, w, r, http.StatusBadGateway, "Hydra に結果を返せない", err)
		return
	}
	http.Redirect(w, r, to, http.StatusSeeOther)
}

// failFunc は、fail と failLogout の型である。
type failFunc func(logger *slog.Logger, w http.ResponseWriter, r *http.Request, code int, reason string, err error)

// fail は、Hydra へ返せない失敗で、ログインの失敗の画面を出す。
func fail(logger *slog.Logger, w http.ResponseWriter, r *http.Request, code int, reason string, err error) {
	failPage(logger, w, r, code, "failure", "ログインの失敗の画面を出す", reason, err)
}

// failLogout は、Hydra へ返せないログアウトの失敗で、ログアウトの失敗の画面を出す。
func failLogout(logger *slog.Logger, w http.ResponseWriter, r *http.Request, code int, reason string, err error) {
	failPage(logger, w, r, code, "logout-failure", "ログアウトの失敗の画面を出す", reason, err)
}

// failPage は、失敗を code が 5xx なら Error、ほかは Warn でログに書き、page の画面を code で出す。
func failPage(logger *slog.Logger, w http.ResponseWriter, r *http.Request, code int, page, msg, reason string, err error) {
	level := slog.LevelWarn
	if code >= http.StatusInternalServerError {
		level = slog.LevelError
	}
	logger.Log(r.Context(), level, msg, "reason", reason, "error", err)
	render(w, logger, code, page, nil)
}

func setCookie(usesSecureCookie bool, w http.ResponseWriter, value string, maxAge int) {
	http.SetCookie(w, &http.Cookie{
		Name:     cookieName,
		Value:    value,
		Path:     "/login",
		MaxAge:   maxAge,
		HttpOnly: true,
		Secure:   usesSecureCookie,
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

// admitClient は、画面の試行を送信元の IP アドレスごとに 1 回数え、上限を超えていれば、Hydra と DB を呼ばずに
// failPage（fail か failLogout）の失敗の画面を 429 で出して false を返す。
// Hydra の admin API の呼び出しを、送信元ごとの上限より増やさないためである。
func admitClient(logger *slog.Logger, limiter *Limiter, clientIPHeader string, failPage failFunc, w http.ResponseWriter, r *http.Request) bool {
	if limiter.Allow(clientAddr(r, clientIPHeader)) {
		return true
	}
	failPage(logger, w, r, http.StatusTooManyRequests, "送信元の IP アドレスの試行の回数の上限を超えた", nil)
	return false
}

// clientAddr は、試行を数える送信元のキーである。IPv4 はアドレス、IPv6 はアドレスを含む /64 のプレフィックスにする。
// IPv6 の /64 は 1 つの回線に割り当てられるので、その中でアドレスを替えても同じ送信元として数える。
//
// header が空なら、接続の相手のアドレスを使う。プロキシの後ろでは、プロキシのアドレスになる。
// header が空でなければ、リバースプロキシが付けたそのヘッダーの、最後の値を使う。X-Forwarded-For のように値を足していく
// ヘッダーでは、最後の値はリバースプロキシが見た送信元で、ブラウザが書いた値ではない。値が IP でなければ接続の相手のアドレスを使う。
func clientAddr(r *http.Request, header string) string {
	if values := r.Header.Values(header); header != "" && len(values) > 0 {
		last := values[len(values)-1]
		if ip, err := netip.ParseAddr(strings.TrimSpace(last[strings.LastIndex(last, ",")+1:])); err == nil {
			return clientKey(ip)
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	if ip, err := netip.ParseAddr(host); err == nil {
		return clientKey(ip)
	}
	return host
}

func clientKey(ip netip.Addr) string {
	ip = ip.Unmap().WithZone("")
	if ip.Is4() {
		return ip.String()
	}
	return netip.PrefixFrom(ip, 64).Masked().String()
}
