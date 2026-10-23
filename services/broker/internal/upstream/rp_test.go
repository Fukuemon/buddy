package upstream_test

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"github.com/Fukuemon/buddy/packages/go/oidc/oidctest"

	"github.com/Fukuemon/buddy/services/broker/internal/upstream"
)

// fakeIdP は、discovery の文書、JWKS、トークンのエンドポイントを持つ上流の IdP のフェイクである。
// トークンのエンドポイントは、claims に署名した ID token を返す。
type fakeIdP struct {
	*oidctest.Issuer
	srv    *httptest.Server
	claims func(nonce string) jwt.MapClaims
	// verifier は、トークンのエンドポイントが受けた PKCE の code verifier である。
	verifier string
	// down が true なら、discovery の文書のエンドポイントは 503 を返す。discoveries は、そのエンドポイントを呼ばれた回数である。
	down        atomic.Bool
	discoveries atomic.Int32
}

func startIdP(t *testing.T) *fakeIdP {
	t.Helper()
	f := &fakeIdP{}
	f.srv = httptest.NewServer(http.HandlerFunc(f.serve))
	t.Cleanup(f.srv.Close)
	iss, err := oidctest.New(f.srv.URL)
	if err != nil {
		t.Fatal(err)
	}
	f.Issuer = iss
	return f
}

func (f *fakeIdP) serve(w http.ResponseWriter, r *http.Request) {
	switch r.URL.Path {
	case "/.well-known/openid-configuration":
		f.discoveries.Add(1)
		if f.down.Load() {
			http.Error(w, "unavailable", http.StatusServiceUnavailable)
			return
		}
		u := f.srv.URL
		// 署名の方式は、discovery の文書の id_token_signing_alg_values_supported で知らせる。無ければ go-oidc は RS256 だけを受ける
		_ = json.NewEncoder(w).Encode(map[string]any{
			"issuer": u, "jwks_uri": u + "/jwks", "authorization_endpoint": u + "/authorize", "token_endpoint": u + "/token",
			"id_token_signing_alg_values_supported": []string{"ES256", "RS256"},
		})
	case "/token":
		f.verifier = r.PostFormValue("code_verifier")
		raw, err := f.Sign(f.claims(r.PostFormValue("code")))
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"access_token": "at", "token_type": "Bearer", "id_token": raw})
	default:
		f.ServeHTTP(w, r)
	}
}

func newRP(t *testing.T, f *fakeIdP, browserOrigin string) *upstream.RP {
	t.Helper()
	idps := upstream.IdPs{"org-a": {OrgID: "org-a", Issuer: f.srv.URL, ClientID: "broker", ClientSecret: "secret"}}
	rp, err := upstream.NewRP(idps, "https://login.example.com/login/callback", browserOrigin, f.srv.Client())
	if err != nil {
		t.Fatal(err)
	}
	return rp
}

func TestAuthURL(t *testing.T) {
	f := startIdP(t)
	a := upstream.NewAttempt()
	raw, err := newRP(t, f, "http://localhost:9000").AuthURL(context.Background(), "org-a", a, "aoki@example.com")
	if err != nil {
		t.Fatal(err)
	}
	u, err := url.Parse(raw)
	if err != nil {
		t.Fatal(err)
	}
	q := u.Query()
	if u.Host != "localhost:9000" || u.Path != "/authorize" {
		t.Errorf("ブラウザの origin に替えていない: %s", raw)
	}
	for k, want := range map[string]string{
		"client_id": "broker", "state": a.State, "nonce": a.Nonce, "code_challenge_method": "S256",
		"redirect_uri": "https://login.example.com/login/callback", "login_hint": "aoki@example.com",
	} {
		if q.Get(k) != want {
			t.Errorf("%s = %q, want %q", k, q.Get(k), want)
		}
	}
	if q.Get("code_challenge") == "" || q.Get("code_challenge") == a.CodeVerifier {
		t.Errorf("code_challenge = %q", q.Get("code_challenge"))
	}
	if !strings.Contains(q.Get("scope"), "openid") {
		t.Errorf("scope = %q", q.Get("scope"))
	}
	if _, err := newRP(t, f, "").AuthURL(context.Background(), "org-x", a, ""); err == nil {
		t.Error("設定の無い組織で転送した")
	}
}

func TestExchange(t *testing.T) {
	a := upstream.NewAttempt()
	tests := []struct {
		name    string
		claims  func(f *fakeIdP, nonce string) jwt.MapClaims
		want    upstream.Identity
		invalid bool
	}{
		{
			name: "確認済みのメール",
			claims: func(f *fakeIdP, nonce string) jwt.MapClaims {
				c := f.Claims("broker", "u-1")
				c["nonce"], c["email"], c["email_verified"] = nonce, "Aoki@example.com", true
				return c
			},
			want: upstream.Identity{Subject: "u-1", Email: "Aoki@example.com", EmailVerified: true},
		},
		{
			name: "email_verified が文字列の true",
			claims: func(f *fakeIdP, nonce string) jwt.MapClaims {
				c := f.Claims("broker", "u-1")
				c["nonce"], c["email"], c["email_verified"] = nonce, "aoki@example.com", "true"
				return c
			},
			want: upstream.Identity{Subject: "u-1", Email: "aoki@example.com", EmailVerified: true},
		},
		{
			name: "email_verified が無い",
			claims: func(f *fakeIdP, nonce string) jwt.MapClaims {
				c := f.Claims("broker", "u-1")
				c["nonce"], c["email"] = nonce, "aoki@example.com"
				return c
			},
			want: upstream.Identity{Subject: "u-1", Email: "aoki@example.com"},
		},
		{
			name: "nonce が違う",
			claims: func(f *fakeIdP, _ string) jwt.MapClaims {
				c := f.Claims("broker", "u-1")
				c["nonce"] = "other"
				return c
			},
			invalid: true,
		},
		{
			name: "aud が違う",
			claims: func(f *fakeIdP, nonce string) jwt.MapClaims {
				c := f.Claims("other-client", "u-1")
				c["nonce"] = nonce
				return c
			},
			invalid: true,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			f := startIdP(t)
			f.claims = func(string) jwt.MapClaims { return tt.claims(f, a.Nonce) }
			got, err := newRP(t, f, "").Exchange(context.Background(), "org-a", "code-1", "", a)
			if tt.invalid {
				if !errors.Is(err, upstream.ErrInvalidToken) {
					t.Errorf("err = %v, want ErrInvalidToken", err)
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			tt.want.Issuer = f.URL()
			if got != tt.want {
				t.Errorf("got %+v, want %+v", got, tt.want)
			}
			if f.verifier != a.CodeVerifier {
				t.Errorf("code_verifier = %q, want %q", f.verifier, a.CodeVerifier)
			}
		})
	}
}

// TestExchangeIssuerParam は、認可レスポンスの iss パラメーター（RFC 9207）を設定の issuer と比べ、
// 違えば認可コードを替えずに拒むことを確かめる。
func TestExchangeIssuerParam(t *testing.T) {
	a := upstream.NewAttempt()
	f := startIdP(t)
	f.claims = func(string) jwt.MapClaims {
		c := f.Claims("broker", "u-1")
		c["nonce"] = a.Nonce
		return c
	}
	rp := newRP(t, f, "")
	if _, err := rp.Exchange(context.Background(), "org-a", "code-1", "https://other-idp.example.com", a); !errors.Is(err, upstream.ErrInvalidToken) {
		t.Errorf("err = %v, want ErrInvalidToken", err)
	}
	if f.verifier != "" {
		t.Error("iss の違う認可レスポンスで、認可コードを替えた")
	}
	if _, err := rp.Exchange(context.Background(), "org-a", "code-1", f.srv.URL, a); err != nil {
		t.Errorf("設定と同じ iss で err = %v", err)
	}
}

// TestProviderDoesNotWaitForOtherIdP は、1 つの事業所の IdP の discovery が応答しない間も、
// ほかの事業所の IdP の discovery を待たずに読めることを確かめる。
func TestProviderDoesNotWaitForOtherIdP(t *testing.T) {
	fast := startIdP(t)
	entered, release := make(chan struct{}), make(chan struct{})
	slow := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		close(entered)
		<-release
		http.Error(w, "unavailable", http.StatusServiceUnavailable)
	}))
	t.Cleanup(slow.Close)
	// slow.Close は応答中の接続を待つので、先に応答を返させる
	t.Cleanup(func() { close(release) })

	idps := upstream.IdPs{
		"org-a":    {OrgID: "org-a", Issuer: fast.srv.URL, ClientID: "broker", ClientSecret: "secret"},
		"org-slow": {OrgID: "org-slow", Issuer: slow.URL, ClientID: "broker", ClientSecret: "secret"},
	}
	rp, err := upstream.NewRP(idps, "https://login.example.com/login/callback", "", &http.Client{})
	if err != nil {
		t.Fatal(err)
	}
	go func() { _, _ = rp.AuthURL(context.Background(), "org-slow", upstream.NewAttempt(), "") }()
	<-entered

	done := make(chan error, 1)
	go func() {
		_, err := rp.AuthURL(context.Background(), "org-a", upstream.NewAttempt(), "")
		done <- err
	}()
	select {
	case err := <-done:
		if err != nil {
			t.Errorf("ほかの事業所の IdP の discovery を読めない: %v", err)
		}
	case <-time.After(2 * time.Second):
		t.Error("応答しない IdP の discovery を待って、ほかの事業所の IdP の discovery を読まない")
	}
}

// TestProviderRemembersFailure は、discovery の文書を読めなかった事業所で、その失敗を短い間だけ覚え、
// 過ぎてから読み直すことを確かめる。
func TestProviderRemembersFailure(t *testing.T) {
	f := startIdP(t)
	f.down.Store(true)
	rp := newRP(t, f, "")
	now := time.Unix(0, 0)
	upstream.SetClock(rp, func() time.Time { return now })

	for range 2 {
		if _, err := rp.AuthURL(context.Background(), "org-a", upstream.NewAttempt(), ""); err == nil {
			t.Fatal("読めない discovery で転送した")
		}
	}
	if got := f.discoveries.Load(); got != 1 {
		t.Errorf("失敗を覚えずに discovery を %d 回読んだ", got)
	}
	f.down.Store(false)
	now = now.Add(time.Minute)
	if _, err := rp.AuthURL(context.Background(), "org-a", upstream.NewAttempt(), ""); err != nil {
		t.Errorf("時間がたっても読み直さない: %v", err)
	}
	if got := f.discoveries.Load(); got != 2 {
		t.Errorf("discovery を読んだ回数 = %d, want 2", got)
	}
}
