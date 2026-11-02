package login_test

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/Fukuemon/buddy/services/broker/internal/hydra"
	"github.com/Fukuemon/buddy/services/broker/internal/login"
	"github.com/Fukuemon/buddy/services/broker/internal/upstream"
)

const (
	aokiID  = "01JAAAAAAAAAAAAAAAAAAAAAAA"
	uenoID  = "01JBBBBBBBBBBBBBBBBBBBBBBB"
	issuerA = "https://idp-a.example.com"
)

type fakeStaff struct {
	members map[string]login.StaffMember
	links   []login.UpstreamAccount
	finds   int
	// beforeLink が nil でなければ、Link の前に呼ぶ。同時のログインが先に結び付けた場面を作る
	beforeLink func(f *fakeStaff, staffID string, a login.UpstreamAccount)
}

func (f *fakeStaff) FindByEmail(_ context.Context, email string) ([]login.StaffMember, error) {
	f.finds++
	var out []login.StaffMember
	for _, m := range f.members {
		if m.Email == email {
			out = append(out, m)
		}
	}
	return out, nil
}

func (f *fakeStaff) Get(_ context.Context, id string) (login.StaffMember, error) {
	m, ok := f.members[id]
	if !ok {
		return login.StaffMember{}, login.ErrNotFound
	}
	return m, nil
}

func (f *fakeStaff) Link(_ context.Context, staffID string, a login.UpstreamAccount) error {
	if f.beforeLink != nil {
		f.beforeLink(f, staffID, a)
	}
	if f.members[staffID].Upstream != (login.UpstreamAccount{}) {
		return login.ErrConflict
	}
	for _, m := range f.members {
		if m.Upstream == a {
			return login.ErrConflict
		}
	}
	m := f.members[staffID]
	m.Upstream = a
	f.members[staffID] = m
	f.links = append(f.links, a)
	return nil
}

// fakeHydra は、受けた accept と reject を残し、ブラウザのリダイレクト先に結果の種類を入れて返す。
type fakeHydra struct {
	login    hydra.LoginRequest
	loginErr error
	// loginReads は、LoginRequest を呼んだ回数である。
	loginReads  int
	consent     hydra.ConsentRequest
	accepted    *hydra.AcceptLogin
	consented   *hydra.AcceptConsent
	rejected    bool
	rejection   hydra.Rejection
	rejectedCon bool
	logoutErr   error
	loggedOut   string
}

func (f *fakeHydra) LoginRequest(context.Context, string) (hydra.LoginRequest, error) {
	f.loginReads++
	return f.login, f.loginErr
}

func (f *fakeHydra) AcceptLogin(_ context.Context, _ string, b hydra.AcceptLogin) (string, error) {
	f.accepted = &b
	return "http://hydra/login-accepted", nil
}

func (f *fakeHydra) RejectLogin(_ context.Context, _ string, b hydra.Rejection) (string, error) {
	f.rejected = true
	f.rejection = b
	return "http://hydra/login-rejected", nil
}

func (f *fakeHydra) ConsentRequest(context.Context, string) (hydra.ConsentRequest, error) {
	return f.consent, nil
}

func (f *fakeHydra) AcceptConsent(_ context.Context, _ string, b hydra.AcceptConsent) (string, error) {
	f.consented = &b
	return "http://hydra/consent-accepted", nil
}

func (f *fakeHydra) RejectConsent(context.Context, string, hydra.Rejection) (string, error) {
	f.rejectedCon = true
	return "http://hydra/consent-rejected", nil
}

func (f *fakeHydra) AcceptLogout(_ context.Context, challenge string) (string, error) {
	if f.logoutErr != nil {
		return "", f.logoutErr
	}
	f.loggedOut = challenge
	return "http://hydra/logout-accepted", nil
}

// fakeUpstream は、認可の画面の URL に組織と state を入れ、認可コードに対して identity を返す。
type fakeUpstream struct {
	identity upstream.Identity
	err      error
	orgs     []string
	// iss は、Exchange が受けた認可レスポンスの iss パラメーターである。
	iss string
}

func (f *fakeUpstream) AuthURL(_ context.Context, orgID string, a upstream.Attempt, hint string) (string, error) {
	f.orgs = append(f.orgs, orgID)
	return "https://" + orgID + ".example.com/authorize?" + url.Values{"state": {a.State}, "login_hint": {hint}}.Encode(), nil
}

func (f *fakeUpstream) Exchange(_ context.Context, orgID, code, iss string, _ upstream.Attempt) (upstream.Identity, error) {
	f.orgs = append(f.orgs, orgID)
	f.iss = iss
	if code != "code-1" {
		return upstream.Identity{}, upstream.ErrInvalidToken
	}
	return f.identity, f.err
}

type env struct {
	staff    *fakeStaff
	hydra    *fakeHydra
	upstream *fakeUpstream
	h        http.Handler
}

func newEnv(limit int) *env {
	return newEnvWith(limit, func(*login.Config) {})
}

// newEnvWith は、送信元の IP アドレスごとの上限を limit にし、設定を edit で替えた env を作る。
func newEnvWith(limit int, edit func(*login.Config)) *env {
	e := &env{
		staff: &fakeStaff{members: map[string]login.StaffMember{
			aokiID: {ID: aokiID, OrgID: "org-a", Email: "aoki@example.com", Status: login.StatusActive},
			uenoID: {ID: uenoID, OrgID: "org-b", Email: "ueno@example.com", Status: login.StatusActive},
		}},
		hydra: &fakeHydra{},
		upstream: &fakeUpstream{identity: upstream.Identity{
			Issuer: issuerA, Subject: "u-aoki", Email: "Aoki@example.com", EmailVerified: true,
		}},
	}
	cfg := login.Config{
		Logger:             slog.New(slog.DiscardHandler),
		Staff:              e.staff,
		Hydra:              e.hydra,
		Upstream:           e.upstream,
		Limiter:            login.NewLimiter(time.Hour, limit),
		EmailLimiter:       login.NewLimiter(time.Hour, 10),
		PublicURL:          "https://login.example.com",
		AutoConsentClients: []string{"web"},
	}
	edit(&cfg)
	h, err := login.NewHandler(cfg)
	if err != nil {
		panic(err)
	}
	e.h = h
	return e
}

func (e *env) do(req *http.Request) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	e.h.ServeHTTP(rec, req)
	return rec
}

func (e *env) submit(email string) *httptest.ResponseRecorder {
	return e.do(submitRequest(email))
}

// submitRequest は、ブラウザがログインの画面の form から送るのと同じ POST /login を作る。
func submitRequest(email string) *http.Request {
	req := httptest.NewRequest(http.MethodPost, "/login", strings.NewReader(url.Values{"login_challenge": {"ch"}, "email": {email}}.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Sec-Fetch-Site", "same-origin")
	req.Header.Set("Origin", "https://login.example.com")
	return req
}

// callback は、submit の応答の cookie と state で、上流の IdP のコールバックを呼ぶ。
func (e *env) callback(t *testing.T, submitted *httptest.ResponseRecorder, code string) *httptest.ResponseRecorder {
	t.Helper()
	to, err := url.Parse(submitted.Header().Get("Location"))
	if err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodGet, "/login/callback?"+url.Values{"state": {to.Query().Get("state")}, "code": {code}}.Encode(), nil)
	for _, c := range submitted.Result().Cookies() {
		req.AddCookie(c)
	}
	return e.do(req)
}

func location(t *testing.T, rec *httptest.ResponseRecorder) string {
	t.Helper()
	if rec.Code != http.StatusSeeOther {
		t.Fatalf("code = %d, want 303: %s", rec.Code, rec.Body)
	}
	return rec.Header().Get("Location")
}

func TestShowLogin(t *testing.T) {
	e := newEnv(10)
	rec := e.do(httptest.NewRequest(http.MethodGet, "/login?login_challenge=ch%22", nil))
	body := rec.Body.String()
	if rec.Code != http.StatusOK || !strings.Contains(body, `name="email"`) || !strings.Contains(body, `value="ch&#34;"`) {
		t.Errorf("code = %d, body = %s", rec.Code, body)
	}
	// 画面の CSS は、apps/broker が packages/ui のトークンと focus-ring から生成したものである
	for _, want := range []string{"--buddy-color-primary:", "--color-primitive-blue-900:#", "focus-ring:focus-visible{outline:4px solid"} {
		if !strings.Contains(body, want) {
			t.Errorf("画面の CSS に %q が無い", want)
		}
	}
	if got := rec.Header().Get("Content-Security-Policy"); got != "frame-ancestors 'none'" {
		t.Errorf("Content-Security-Policy = %q, want frame-ancestors 'none'", got)
	}
	if rec := e.do(httptest.NewRequest(http.MethodGet, "/login", nil)); rec.Code != http.StatusBadRequest {
		t.Errorf("login_challenge の無い code = %d, want 400", rec.Code)
	}
}

// TestShowLoginSkip は、Hydra がログインのセッションを覚えているとき、画面を出さずに有効な職員だけを accept することを確認する。
func TestShowLoginSkip(t *testing.T) {
	for _, tt := range []struct {
		name   string
		status string
		want   string
	}{
		{"有効な職員", login.StatusActive, "http://hydra/login-accepted"},
		{"止めた職員", login.StatusSuspended, "http://hydra/login-rejected"},
		{"退職した職員", login.StatusRetired, "http://hydra/login-rejected"},
		{"登録の途中の職員", login.StatusPending, "http://hydra/login-rejected"},
	} {
		t.Run(tt.name, func(t *testing.T) {
			e := newEnv(10)
			m := e.staff.members[aokiID]
			m.Status = tt.status
			e.staff.members[aokiID] = m
			e.hydra.login = hydra.LoginRequest{Skip: true, Subject: aokiID}
			if got := location(t, e.do(httptest.NewRequest(http.MethodGet, "/login?login_challenge=ch", nil))); got != tt.want {
				t.Errorf("Location = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestSubmitEmail(t *testing.T) {
	e := newEnv(10)
	rec := e.submit(" AOKI@example.com ")
	to, err := url.Parse(location(t, rec))
	if err != nil {
		t.Fatal(err)
	}
	if to.Host != "org-a.example.com" || to.Query().Get("login_hint") != "aoki@example.com" {
		t.Errorf("Location = %s, want 事業所 org-a の上流の IdP", to)
	}
	cookies := rec.Result().Cookies()
	if len(cookies) != 1 || !cookies[0].HttpOnly || cookies[0].SameSite != http.SameSiteLaxMode || cookies[0].Path != "/login" {
		t.Errorf("cookies = %+v", cookies)
	}
}

// TestSubmitEmailRejects は、職員を 1 人に決められないメールでは、事業所を示さずにログインを拒むことを確認する。
func TestSubmitEmailRejects(t *testing.T) {
	tests := []struct {
		name  string
		email string
		setup func(*fakeStaff)
	}{
		{"登録していないメール", "nobody@example.com", nil},
		{"止めた職員", "aoki@example.com", func(s *fakeStaff) {
			m := s.members[aokiID]
			m.Status = login.StatusSuspended
			s.members[aokiID] = m
		}},
		{"登録の途中の職員", "aoki@example.com", func(s *fakeStaff) {
			m := s.members[aokiID]
			m.Status = login.StatusPending
			s.members[aokiID] = m
		}},
		{"2 つの事業所に同じメール", "aoki@example.com", func(s *fakeStaff) {
			s.members[uenoID] = login.StaffMember{ID: uenoID, OrgID: "org-b", Email: "aoki@example.com", Status: login.StatusActive}
		}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			e := newEnv(10)
			if tt.setup != nil {
				tt.setup(e.staff)
			}
			rec := e.submit(tt.email)
			if got := location(t, rec); got != "http://hydra/login-rejected" {
				t.Errorf("Location = %q, want reject", got)
			}
			if e.hydra.rejection != hydra.AccessDenied {
				t.Errorf("rejection = %+v, want 上限と分けない reject", e.hydra.rejection)
			}
			if len(e.upstream.orgs) != 0 || len(rec.Result().Cookies()) != 0 {
				t.Errorf("上流の IdP へリダイレクトした: orgs = %v", e.upstream.orgs)
			}
		})
	}
}

// TestSubmitEmailRateLimit は、送信元の IP アドレスの上限を超えた試行に、Hydra を呼ばずにログインの失敗の画面を出すことを確認する。
// ログインの画面を開く GET /login も、同じ上限で数える。
func TestSubmitEmailRateLimit(t *testing.T) {
	e := newEnv(3)
	if rec := e.do(httptest.NewRequest(http.MethodGet, "/login?login_challenge=ch", nil)); rec.Code != http.StatusOK {
		t.Fatalf("GET /login の code = %d, want 200", rec.Code)
	}
	for i := range 2 {
		if to, err := url.Parse(location(t, e.submit("aoki@example.com"))); err != nil || to.Host != "org-a.example.com" {
			t.Errorf("%d 回目のリダイレクト先 = %v, want 上流の IdP", i+1, to)
		}
	}
	reads := e.hydra.loginReads
	for _, req := range []*http.Request{submitRequest("aoki@example.com"), httptest.NewRequest(http.MethodGet, "/login?login_challenge=ch", nil)} {
		rec := e.do(req)
		if rec.Code != http.StatusTooManyRequests || !strings.Contains(rec.Body.String(), "ログインできませんでした") {
			t.Errorf("%s の code = %d, want 429 のログインの失敗の画面", req.Method, rec.Code)
		}
	}
	if e.hydra.loginReads != reads || e.hydra.rejected || e.staff.finds != 2 {
		t.Errorf("上限を超えた後に Hydra か職員を呼んだ: LoginRequest = %d 回, rejected = %v, finds = %d",
			e.hydra.loginReads-reads, e.hydra.rejected, e.staff.finds)
	}
}

// TestSubmitEmailBodyTooLarge は、上限を超えた本文の POST /login に、Hydra を呼ばずにログインの失敗の画面を出すことを確認する。
func TestSubmitEmailBodyTooLarge(t *testing.T) {
	e := newEnv(10)
	rec := e.submit(strings.Repeat("a", 8<<10) + "@example.com")
	if rec.Code != http.StatusRequestEntityTooLarge || !strings.Contains(rec.Body.String(), "ログインできませんでした") {
		t.Errorf("code = %d, want 413 のログインの失敗の画面", rec.Code)
	}
	if e.hydra.loginReads != 0 || e.hydra.rejected || e.staff.finds != 0 {
		t.Errorf("Hydra か職員を呼んだ: LoginRequest = %d 回, finds = %d", e.hydra.loginReads, e.staff.finds)
	}
	// 読めない本文の送信も、送信元の IP アドレスの上限で数える
	e = newEnv(1)
	e.submit(strings.Repeat("a", 8<<10))
	if rec := e.submit("aoki@example.com"); rec.Code != http.StatusTooManyRequests {
		t.Errorf("上限を超えた本文の後の code = %d, want 429", rec.Code)
	}
}

// TestSubmitEmailInvalidEmail は、職員のメールの形でないメールに、メールごとの上限で数えずにログインの失敗の画面を出すことを確認する。
func TestSubmitEmailInvalidEmail(t *testing.T) {
	long := strings.Repeat("a", login.MaxEmailLen-len("@example.com")+1) + "@example.com"
	for _, tt := range []struct{ name, email string }{
		{"321 文字", long},
		{"@ が無い", "aoki.example.com"},
		{"@ の前が空", "@example.com"},
		{"空", ""},
	} {
		t.Run(tt.name, func(t *testing.T) {
			emails := login.NewLimiter(time.Hour, 10)
			e := newEnvWith(10, func(c *login.Config) { c.EmailLimiter = emails })
			rec := e.submit(tt.email)
			if rec.Code != http.StatusBadRequest || !strings.Contains(rec.Body.String(), "ログインできませんでした") {
				t.Errorf("code = %d, want 400 のログインの失敗の画面", rec.Code)
			}
			if n := login.LimiterKeys(emails); n != 0 {
				t.Errorf("メールごとの上限のキーが %d 個ある, want 0", n)
			}
			if e.hydra.loginReads != 0 || e.hydra.rejected || e.staff.finds != 0 {
				t.Errorf("Hydra か職員を呼んだ: LoginRequest = %d 回, finds = %d", e.hydra.loginReads, e.staff.finds)
			}
		})
	}
	// 320 文字のメールは形が正しく、職員を引く
	e := newEnv(10)
	location(t, e.submit(long[1:]))
	if e.staff.finds != 1 {
		t.Errorf("320 文字のメールで職員を引かない: finds = %d", e.staff.finds)
	}
	// 形の違うメールの送信も、送信元の IP アドレスの上限で数える
	e = newEnv(1)
	e.submit("")
	if rec := e.submit("aoki@example.com"); rec.Code != http.StatusTooManyRequests {
		t.Errorf("形の違うメールの後の code = %d, want 429", rec.Code)
	}
}

// TestClientAddr は、送信元のキーを、IPv4 はアドレス、IPv6 は /64 のプレフィックスにそろえることを確認する。
func TestClientAddr(t *testing.T) {
	for _, tt := range []struct {
		name, remote, header, value, want string
	}{
		{"IPv4", "198.51.100.1:1234", "", "", "198.51.100.1"},
		{"IPv4 を埋めた IPv6", "[::ffff:198.51.100.1]:1234", "", "", "198.51.100.1"},
		{"IPv6", "[2001:db8:1:2:3:4:5:6]:1234", "", "", "2001:db8:1:2::/64"},
		{"zone 付きの IPv6", "[fe80::1%eth0]:1234", "", "", "fe80::/64"},
		{"ヘッダーの IPv6", "10.0.0.1:1234", "X-Forwarded-For", "203.0.113.9, 2001:db8:1:2::9", "2001:db8:1:2::/64"},
		{"ヘッダーが IP でない", "10.0.0.1:1234", "X-Forwarded-For", "unknown", "10.0.0.1"},
		{"接続の相手が IP でない", "pipe", "", "", "pipe"},
	} {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/login", nil)
			req.RemoteAddr = tt.remote
			if tt.header != "" {
				req.Header.Set(tt.header, tt.value)
			}
			if got := login.ClientAddr(req, tt.header); got != tt.want {
				t.Errorf("clientAddr = %q, want %q", got, tt.want)
			}
		})
	}
}

// TestSubmitEmailIPv6Prefix は、送信元の IPv6 アドレスを /64 ごとに数えることを確認する。
func TestSubmitEmailIPv6Prefix(t *testing.T) {
	e := newEnv(1)
	send := func(addr string) int {
		req := submitRequest("aoki@example.com")
		req.RemoteAddr = addr
		return e.do(req).Code
	}
	if got := send("[2001:db8:1:2::1]:1234"); got != http.StatusSeeOther {
		t.Errorf("1 回目の code = %d, want 303", got)
	}
	if got := send("[2001:db8:1:2:ffff::9]:1234"); got != http.StatusTooManyRequests {
		t.Errorf("同じ /64 の別のアドレスの code = %d, want 429", got)
	}
	if got := send("[2001:db8:1:3::1]:1234"); got != http.StatusSeeOther {
		t.Errorf("別の /64 の code = %d, want 303", got)
	}
}

// TestSubmitEmailInvalidChallenge は、Hydra が知らない login_challenge では、職員を引かずにログインの失敗の画面を出すことを確認する。
func TestSubmitEmailInvalidChallenge(t *testing.T) {
	e := newEnv(10)
	e.hydra.loginErr = errors.New("hydra: 404 not found")
	rec := e.submit("aoki@example.com")
	if rec.Code != http.StatusBadRequest || !strings.Contains(rec.Body.String(), "ログインできませんでした") {
		t.Errorf("code = %d, body = %s", rec.Code, rec.Body)
	}
	if e.staff.finds != 0 || len(e.upstream.orgs) != 0 || e.hydra.rejected {
		t.Errorf("職員を引いたか、Hydra に結果を返した: finds = %d, orgs = %v", e.staff.finds, e.upstream.orgs)
	}
}

// TestSubmitEmailCrossOrigin は、ほかのサイトから送られた POST /login を、Hydra に問い合わせずに 403 で拒むことを確認する。
func TestSubmitEmailCrossOrigin(t *testing.T) {
	tests := []struct {
		name    string
		headers map[string]string
		allowed bool
	}{
		{"同じ origin の form", map[string]string{"Sec-Fetch-Site": "same-origin"}, true},
		{"Sec-Fetch-Site が cross-site", map[string]string{"Sec-Fetch-Site": "cross-site", "Origin": "https://evil.example.net"}, false},
		{"Sec-Fetch-Site が same-site", map[string]string{"Sec-Fetch-Site": "same-site", "Origin": "https://other.example.com"}, false},
		{"Sec-Fetch-Site が無く、Origin が別のサイト", map[string]string{"Origin": "https://evil.example.net"}, false},
		// プロキシの後ろで Host が違っても、PublicURL の origin は受ける
		{"Sec-Fetch-Site が無く、Origin が PublicURL", map[string]string{"Origin": "https://login.example.com"}, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			e := newEnv(10)
			req := submitRequest("aoki@example.com")
			req.Header.Del("Sec-Fetch-Site")
			req.Header.Del("Origin")
			for k, v := range tt.headers {
				req.Header.Set(k, v)
			}
			rec := e.do(req)
			if tt.allowed {
				location(t, rec)
				return
			}
			if rec.Code != http.StatusForbidden || e.staff.finds != 0 || e.hydra.rejected {
				t.Errorf("code = %d, finds = %d, want 403 で職員を引かない", rec.Code, e.staff.finds)
			}
		})
	}
}

// TestSubmitEmailRateLimitPerEmail は、送信元の IP アドレスを替えても、同じメールの試行を上限で止めることを確認する。
func TestSubmitEmailRateLimitPerEmail(t *testing.T) {
	e := newEnvWith(100, func(c *login.Config) { c.EmailLimiter = login.NewLimiter(time.Hour, 2) })
	for i, want := range []string{"org-a.example.com", "org-a.example.com", "hydra"} {
		req := submitRequest("aoki@example.com")
		req.RemoteAddr = "192.0.2." + strconv.Itoa(10+i) + ":1234"
		to, err := url.Parse(location(t, e.do(req)))
		if err != nil || to.Host != want {
			t.Errorf("%d 回目のリダイレクト先 = %v, want %s", i+1, to, want)
		}
	}
	if e.hydra.rejection != hydra.TooManyAttempts {
		t.Errorf("rejection = %+v, want 上限を超えたことを分けた reject", e.hydra.rejection)
	}
	if to, _ := url.Parse(location(t, e.submit("ueno@example.com"))); to.Host != "org-b.example.com" {
		t.Errorf("別のメールまで止めた: %v", to)
	}
}

// TestSubmitEmailClientIPHeader は、送信元の IP アドレスを、設定したヘッダーの最後の値から読むことを確認する。
// 最後の値はリバースプロキシが足したもので、ブラウザが先頭に書いた値では数え分けない。
func TestSubmitEmailClientIPHeader(t *testing.T) {
	e := newEnvWith(1, func(c *login.Config) { c.ClientIPHeader = "X-Forwarded-For" })
	send := func(xff string) int {
		req := submitRequest("aoki@example.com")
		req.RemoteAddr = "10.0.0.1:1234"
		req.Header.Set("X-Forwarded-For", xff)
		return e.do(req).Code
	}
	if got := send("198.51.100.1"); got != http.StatusSeeOther {
		t.Errorf("1 人目の code = %d, want 303", got)
	}
	if got := send("198.51.100.2"); got != http.StatusSeeOther {
		t.Errorf("プロキシのアドレスで数え、別の送信元を止めた: code = %d", got)
	}
	if got := send("203.0.113.9, 198.51.100.1"); got != http.StatusTooManyRequests {
		t.Errorf("ブラウザが書いた先頭の値で数え分けた: code = %d", got)
	}
}

func TestCallback(t *testing.T) {
	tests := []struct {
		name     string
		identity upstream.Identity
		linked   login.UpstreamAccount
		code     string
		accepted bool
		linkedTo []login.UpstreamAccount
	}{
		{
			name:     "初回のログインで、確認済みのメールが登録と同じなら結び付ける",
			identity: upstream.Identity{Issuer: issuerA, Subject: "u-aoki", Email: "Aoki@example.com", EmailVerified: true},
			code:     "code-1", accepted: true,
			linkedTo: []login.UpstreamAccount{{Issuer: issuerA, Subject: "u-aoki"}},
		},
		{
			name:     "上流のメールが登録と違う",
			identity: upstream.Identity{Issuer: issuerA, Subject: "u-aoki", Email: "other@example.com", EmailVerified: true},
			code:     "code-1",
		},
		{
			name:     "上流のメールが確認済みでない",
			identity: upstream.Identity{Issuer: issuerA, Subject: "u-aoki", Email: "aoki@example.com"},
			code:     "code-1",
		},
		{
			name:     "結び付け済みなら iss と sub で照合し、メールを見ない",
			identity: upstream.Identity{Issuer: issuerA, Subject: "u-aoki", Email: "renamed@example.com"},
			linked:   login.UpstreamAccount{Issuer: issuerA, Subject: "u-aoki"},
			code:     "code-1", accepted: true,
		},
		{
			name:     "結び付けた上流のアカウントと違う",
			identity: upstream.Identity{Issuer: issuerA, Subject: "u-other", Email: "aoki@example.com", EmailVerified: true},
			linked:   login.UpstreamAccount{Issuer: issuerA, Subject: "u-aoki"},
			code:     "code-1",
		},
		{
			name:     "上流のアカウントが別の職員に結び付いている",
			identity: upstream.Identity{Issuer: issuerA, Subject: "u-ueno", Email: "aoki@example.com", EmailVerified: true},
			code:     "code-1",
		},
		{
			name:     "ID token を検証できない",
			identity: upstream.Identity{Issuer: issuerA, Subject: "u-aoki", Email: "aoki@example.com", EmailVerified: true},
			code:     "bad-code",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			e := newEnv(10)
			e.upstream.identity = tt.identity
			aoki := e.staff.members[aokiID]
			aoki.Upstream = tt.linked
			e.staff.members[aokiID] = aoki
			ueno := e.staff.members[uenoID]
			ueno.Upstream = login.UpstreamAccount{Issuer: issuerA, Subject: "u-ueno"}
			e.staff.members[uenoID] = ueno

			rec := e.callback(t, e.submit("aoki@example.com"), tt.code)
			got := location(t, rec)
			if tt.accepted {
				if a := e.hydra.accepted; got != "http://hydra/login-accepted" || a.Subject != aokiID || !a.Remember || a.RememberFor != 12*60*60 {
					t.Errorf("Location = %q, accepted = %+v, want 職員の ID で 12 時間覚えて accept", got, a)
				}
			} else if got != "http://hydra/login-rejected" {
				t.Errorf("Location = %q, want reject", got)
			}
			if len(e.staff.links) != len(tt.linkedTo) || (len(tt.linkedTo) > 0 && e.staff.links[0] != tt.linkedTo[0]) {
				t.Errorf("links = %+v, want %+v", e.staff.links, tt.linkedTo)
			}
			if e.upstream.orgs[len(e.upstream.orgs)-1] != "org-a" {
				t.Errorf("職員の事業所の上流の IdP で替えていない: %v", e.upstream.orgs)
			}
			for _, c := range rec.Result().Cookies() {
				if c.Name == "broker_login" && c.MaxAge >= 0 {
					t.Errorf("ログインの途中の cookie を消していない: %+v", c)
				}
			}
		})
	}
}

// TestCallbackBadRequest は、コールバックがこのブラウザで始めたログインのものと確認できないとき、
// Hydra に返さずにログインの失敗の画面を出すことを確認する。
func TestCallbackBadRequest(t *testing.T) {
	e := newEnv(10)
	submitted := e.submit("aoki@example.com")
	tests := []struct {
		name string
		req  *http.Request
	}{
		{"cookie が無い", httptest.NewRequest(http.MethodGet, "/login/callback?state=x&code=code-1", nil)},
		{"state が違う", func() *http.Request {
			req := httptest.NewRequest(http.MethodGet, "/login/callback?state=other&code=code-1", nil)
			for _, c := range submitted.Result().Cookies() {
				req.AddCookie(c)
			}
			return req
		}()},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := e.do(tt.req)
			if rec.Code != http.StatusBadRequest || !strings.Contains(rec.Body.String(), "ログインできませんでした") {
				t.Errorf("code = %d, body = %s", rec.Code, rec.Body)
			}
			if e.hydra.accepted != nil || e.hydra.rejected {
				t.Error("Hydra に結果を返した")
			}
		})
	}
}

// TestCallbackConcurrentFirstLogin は、同じ上流のアカウントの同時の初回ログインで、先のログインが同じ職員に結び付けたなら、
// ErrConflict でも accept することを確認する。
func TestCallbackConcurrentFirstLogin(t *testing.T) {
	for _, tt := range []struct {
		name    string
		linked  login.UpstreamAccount
		wantLoc string
	}{
		{"先のログインが同じアカウントを結び付けた", login.UpstreamAccount{Issuer: issuerA, Subject: "u-aoki"}, "http://hydra/login-accepted"},
		{"先のログインが別のアカウントを結び付けた", login.UpstreamAccount{Issuer: issuerA, Subject: "u-other"}, "http://hydra/login-rejected"},
	} {
		t.Run(tt.name, func(t *testing.T) {
			e := newEnv(10)
			e.staff.beforeLink = func(f *fakeStaff, staffID string, _ login.UpstreamAccount) {
				m := f.members[staffID]
				m.Upstream = tt.linked
				f.members[staffID] = m
			}
			if got := location(t, e.callback(t, e.submit("aoki@example.com"), "code-1")); got != tt.wantLoc {
				t.Errorf("Location = %q, want %q", got, tt.wantLoc)
			}
		})
	}
}

// TestCallbackPassesIssuer は、認可レスポンスの iss パラメーターを、上流の IdP の RP に渡すことを確認する。
func TestCallbackPassesIssuer(t *testing.T) {
	e := newEnv(10)
	submitted := e.submit("aoki@example.com")
	to, _ := url.Parse(submitted.Header().Get("Location"))
	req := httptest.NewRequest(http.MethodGet, "/login/callback?"+url.Values{"state": {to.Query().Get("state")}, "code": {"code-1"}, "iss": {issuerA}}.Encode(), nil)
	for _, c := range submitted.Result().Cookies() {
		req.AddCookie(c)
	}
	location(t, e.do(req))
	if e.upstream.iss != issuerA {
		t.Errorf("iss = %q, want %q", e.upstream.iss, issuerA)
	}
}

func TestCallbackUpstreamError(t *testing.T) {
	e := newEnv(10)
	submitted := e.submit("aoki@example.com")
	to, _ := url.Parse(submitted.Header().Get("Location"))
	req := httptest.NewRequest(http.MethodGet, "/login/callback?"+url.Values{"state": {to.Query().Get("state")}, "error": {"access_denied"}}.Encode(), nil)
	for _, c := range submitted.Result().Cookies() {
		req.AddCookie(c)
	}
	if got := location(t, e.do(req)); got != "http://hydra/login-rejected" {
		t.Errorf("Location = %q, want reject", got)
	}
}

func TestConsent(t *testing.T) {
	e := newEnv(10)
	e.hydra.consent = hydra.ConsentRequest{
		Subject:        uenoID,
		RequestedScope: []string{"openid", "email", "offline_access"},
		Client:         hydra.OAuth2Client{ClientID: "web", Audience: []string{"schedule", "receipt"}},
	}
	got := location(t, e.do(httptest.NewRequest(http.MethodGet, "/consent?consent_challenge=ch", nil)))
	c := e.hydra.consented
	if got != "http://hydra/consent-accepted" || c == nil {
		t.Fatalf("Location = %q, want accept", got)
	}
	if strings.Join(c.GrantAudience, ",") != "schedule,receipt" || len(c.GrantScope) != 3 || c.Session.AccessToken["org_id"] != "org-b" {
		t.Errorf("accept = %+v", c)
	}

	m := e.staff.members[uenoID]
	m.Status = login.StatusSuspended
	e.staff.members[uenoID] = m
	if got := location(t, e.do(httptest.NewRequest(http.MethodGet, "/consent?consent_challenge=ch", nil))); got != "http://hydra/consent-rejected" {
		t.Errorf("止めた職員の Location = %q, want reject", got)
	}
}

// TestConsentOtherClient は、同意を自動で accept するクライアントの一覧に無いクライアントの同意を拒むことを確認する。
func TestConsentOtherClient(t *testing.T) {
	e := newEnv(10)
	e.hydra.consent = hydra.ConsentRequest{
		Subject:        aokiID,
		RequestedScope: []string{"openid"},
		Client:         hydra.OAuth2Client{ClientID: "third-party", Audience: []string{"schedule"}},
	}
	got := location(t, e.do(httptest.NewRequest(http.MethodGet, "/consent?consent_challenge=ch", nil)))
	if got != "http://hydra/consent-rejected" || e.hydra.consented != nil {
		t.Errorf("Location = %q, consented = %+v, want reject", got, e.hydra.consented)
	}
}

// TestLogout は、ログアウトの要求を画面を出さずに accept し、Hydra へ返せなければログアウトの失敗の画面を出すことを確認する。
func TestLogout(t *testing.T) {
	e := newEnv(10)
	if got := location(t, e.do(httptest.NewRequest(http.MethodGet, "/logout?logout_challenge=ch", nil))); got != "http://hydra/logout-accepted" || e.hydra.loggedOut != "ch" {
		t.Errorf("Location = %q, accepted = %q, want ch の accept", got, e.hydra.loggedOut)
	}
	if rec := e.do(httptest.NewRequest(http.MethodGet, "/logout", nil)); rec.Code != http.StatusBadRequest || !strings.Contains(rec.Body.String(), "ログアウトできませんでした") {
		t.Errorf("logout_challenge の無い code = %d, body = %s", rec.Code, rec.Body.String())
	}
	e.hydra.logoutErr = errors.New("hydra down")
	if rec := e.do(httptest.NewRequest(http.MethodGet, "/logout?logout_challenge=ch", nil)); rec.Code != http.StatusBadGateway || !strings.Contains(rec.Body.String(), "ログアウトできませんでした") {
		t.Errorf("Hydra の失敗の code = %d, body = %s", rec.Code, rec.Body.String())
	}
}

func TestLimiter(t *testing.T) {
	now := time.Unix(0, 0)
	l := login.NewLimiter(time.Minute, 2)
	login.SetLimiterClock(l, func() time.Time { return now })
	for i, want := range []bool{true, true, false} {
		if got := l.Allow("192.0.2.1"); got != want {
			t.Errorf("%d 回目 = %v, want %v", i+1, got, want)
		}
	}
	if !l.Allow("192.0.2.2") {
		t.Error("別のアドレスまで止めた")
	}
	now = now.Add(time.Minute)
	if !l.Allow("192.0.2.1") {
		t.Error("時間がたっても戻らない")
	}
}
