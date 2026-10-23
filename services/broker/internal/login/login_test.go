package login_test

import (
	"context"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
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
}

func (f *fakeStaff) FindByEmail(_ context.Context, email string) ([]login.StaffMember, error) {
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

// fakeHydra は、受けた accept と reject を残し、ブラウザを転送する先に結果の種類を入れて返す。
type fakeHydra struct {
	login       hydra.LoginRequest
	consent     hydra.ConsentRequest
	accepted    *hydra.AcceptLogin
	consented   *hydra.AcceptConsent
	rejected    bool
	rejectedCon bool
}

func (f *fakeHydra) LoginRequest(context.Context, string) (hydra.LoginRequest, error) {
	return f.login, nil
}

func (f *fakeHydra) AcceptLogin(_ context.Context, _ string, b hydra.AcceptLogin) (string, error) {
	f.accepted = &b
	return "http://hydra/login-accepted", nil
}

func (f *fakeHydra) RejectLogin(context.Context, string, hydra.Rejection) (string, error) {
	f.rejected = true
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

// fakeUpstream は、認可の画面の URL に組織と state を入れ、認可コードに対して identity を返す。
type fakeUpstream struct {
	identity upstream.Identity
	err      error
	orgs     []string
}

func (f *fakeUpstream) AuthURL(_ context.Context, orgID string, a upstream.Attempt, hint string) (string, error) {
	f.orgs = append(f.orgs, orgID)
	return "https://" + orgID + ".example.com/authorize?" + url.Values{"state": {a.State}, "login_hint": {hint}}.Encode(), nil
}

func (f *fakeUpstream) Exchange(_ context.Context, orgID, code string, _ upstream.Attempt) (upstream.Identity, error) {
	f.orgs = append(f.orgs, orgID)
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
	e.h = login.NewHandler(login.Config{
		Logger:   slog.New(slog.DiscardHandler),
		Staff:    e.staff,
		Hydra:    e.hydra,
		Upstream: e.upstream,
		Limiter:  login.NewLimiter(time.Hour, limit),
	})
	return e
}

func (e *env) do(req *http.Request) *httptest.ResponseRecorder {
	req.RemoteAddr = "192.0.2.1:1234"
	rec := httptest.NewRecorder()
	e.h.ServeHTTP(rec, req)
	return rec
}

func (e *env) submit(email string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodPost, "/login", strings.NewReader(url.Values{"login_challenge": {"ch"}, "email": {email}}.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	return e.do(req)
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
	if rec := e.do(httptest.NewRequest(http.MethodGet, "/login", nil)); rec.Code != http.StatusBadRequest {
		t.Errorf("login_challenge の無い code = %d, want 400", rec.Code)
	}
}

// TestShowLoginSkip は、Hydra がログインのセッションを覚えているとき、画面を出さずに有効な職員だけを accept することを確かめる。
func TestShowLoginSkip(t *testing.T) {
	for _, tt := range []struct {
		name   string
		status string
		want   string
	}{
		{"有効な職員", login.StatusActive, "http://hydra/login-accepted"},
		{"止めた職員", login.StatusSuspended, "http://hydra/login-rejected"},
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

// TestSubmitEmailRejects は、職員を 1 人に決められないメールでは、事業所を示さずにログインを拒むことを確かめる。
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
			if len(e.upstream.orgs) != 0 || len(rec.Result().Cookies()) != 0 {
				t.Errorf("上流の IdP へ転送した: orgs = %v", e.upstream.orgs)
			}
		})
	}
}

func TestSubmitEmailRateLimit(t *testing.T) {
	e := newEnv(2)
	for i, want := range []string{"org-a.example.com", "org-a.example.com", "hydra"} {
		to, err := url.Parse(location(t, e.submit("aoki@example.com")))
		if err != nil || to.Host != want {
			t.Errorf("%d 回目の転送先 = %v, want %s", i+1, to, want)
		}
	}
	if !e.hydra.rejected {
		t.Error("上限を超えた試行を拒んでいない")
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
			name:     "結び付け済みなら iss と sub で照らし、メールを見ない",
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
				if got != "http://hydra/login-accepted" || e.hydra.accepted.Subject != aokiID || e.hydra.accepted.Remember {
					t.Errorf("Location = %q, accepted = %+v, want 職員の ID で覚えずに accept", got, e.hydra.accepted)
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

// TestCallbackBadRequest は、コールバックがこのブラウザで始めたログインのものと確かめられないとき、
// Hydra に返さずにログインの失敗の画面を出すことを確かめる。
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
