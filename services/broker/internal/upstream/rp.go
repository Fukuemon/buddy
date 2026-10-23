package upstream

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"sync"
	"time"

	"github.com/coreos/go-oidc/v3/oidc"
	"golang.org/x/oauth2"
)

// discoveryTimeout は、上流の IdP の discovery の文書を読む上限である。
const discoveryTimeout = 10 * time.Second

// Identity は、上流の IdP の ID token から読んだ、職員の照合に使う主張である。
type Identity struct {
	Issuer        string
	Subject       string
	Email         string
	EmailVerified bool
}

// Attempt は、上流の IdP へ転送する 1 回のログインの値である。ブラウザの cookie に置き、コールバックで照らす。
type Attempt struct {
	State        string
	Nonce        string
	CodeVerifier string
}

// NewAttempt は、推測できない state、nonce、PKCE の code verifier を作る。
func NewAttempt() Attempt {
	return Attempt{State: oauth2.GenerateVerifier(), Nonce: oauth2.GenerateVerifier(), CodeVerifier: oauth2.GenerateVerifier()}
}

// RP は、ブローカーを上流の IdP の RP として動かす。discovery の文書は事業所ごとに初めて使うときに読み、覚える。
// 複数の goroutine から同時に使える。
type RP struct {
	idps        IdPs
	redirectURL string
	// browserOrigin が空でなければ、認可のエンドポイントの scheme とホストをこれに替える。
	browserOrigin *url.URL
	client        *http.Client

	mu        sync.Mutex
	providers map[string]*oidc.Provider
}

// NewRP は、idps の上流の IdP に、redirectURL をコールバックにして転送する RP を作る。
//
// browserOrigin は、ローカル環境のように、ブローカーが discovery を読む issuer の URL にブラウザが届かないときだけ渡す。
// 認可のエンドポイントの scheme とホストを browserOrigin に替えて、ブラウザを転送する。空なら替えない。
// client が nil なら、上流の IdP へのリクエストを 10 秒で打ち切る client を使う。
func NewRP(idps IdPs, redirectURL, browserOrigin string, client *http.Client) (*RP, error) {
	rp := &RP{idps: idps, redirectURL: redirectURL, client: client, providers: map[string]*oidc.Provider{}}
	if rp.client == nil {
		rp.client = &http.Client{Timeout: discoveryTimeout}
	}
	if browserOrigin != "" {
		u, err := url.Parse(browserOrigin)
		if err != nil || !isHTTPURL(browserOrigin) {
			return nil, fmt.Errorf("上流の IdP のブラウザの origin %q は http か https の URL にする", browserOrigin)
		}
		rp.browserOrigin = u
	}
	return rp, nil
}

// provider は、事業所 orgID の上流の IdP の discovery の文書を返す。読めなかったときは覚えず、次に読み直す。
func (rp *RP) provider(ctx context.Context, orgID string) (IdP, *oidc.Provider, error) {
	idp, ok := rp.idps.Of(orgID)
	if !ok {
		return IdP{}, nil, fmt.Errorf("組織 %s の上流の IdP の設定がない", orgID)
	}
	rp.mu.Lock()
	defer rp.mu.Unlock()
	if p, ok := rp.providers[orgID]; ok {
		return idp, p, nil
	}
	ctx, cancel := context.WithTimeout(oidc.ClientContext(ctx, rp.client), discoveryTimeout)
	defer cancel()
	p, err := oidc.NewProvider(ctx, idp.Issuer)
	if err != nil {
		return IdP{}, nil, fmt.Errorf("組織 %s の上流の IdP の discovery: %w", orgID, err)
	}
	rp.providers[orgID] = p
	return idp, p, nil
}

func (rp *RP) config(idp IdP, p *oidc.Provider) *oauth2.Config {
	return &oauth2.Config{
		ClientID:     idp.ClientID,
		ClientSecret: idp.ClientSecret,
		Endpoint:     p.Endpoint(),
		RedirectURL:  rp.redirectURL,
		Scopes:       []string{oidc.ScopeOpenID, "email"},
	}
}

// AuthURL は、事業所 orgID の上流の IdP の認可の画面の URL を返す。loginHint は、上流の IdP のログインの画面に入れておくメールである。
func (rp *RP) AuthURL(ctx context.Context, orgID string, a Attempt, loginHint string) (string, error) {
	idp, p, err := rp.provider(ctx, orgID)
	if err != nil {
		return "", err
	}
	raw := rp.config(idp, p).AuthCodeURL(a.State,
		oidc.Nonce(a.Nonce),
		oauth2.S256ChallengeOption(a.CodeVerifier),
		oauth2.SetAuthURLParam("login_hint", loginHint),
	)
	if rp.browserOrigin == nil {
		return raw, nil
	}
	u, err := url.Parse(raw)
	if err != nil {
		return "", fmt.Errorf("組織 %s の上流の IdP の認可の URL: %w", orgID, err)
	}
	u.Scheme, u.Host = rp.browserOrigin.Scheme, rp.browserOrigin.Host
	return u.String(), nil
}

// ErrInvalidToken は、上流の IdP の ID token の検証に失敗したことを示す。
var ErrInvalidToken = errors.New("上流の IdP の ID token を検証できない")

// Exchange は、事業所 orgID の上流の IdP の認可コード code を ID token に替えて検証し、主張を返す。
// ID token の署名、iss、aud、exp、nonce を確かめる。トークンを取れないときと、検証に失敗したときは ErrInvalidToken を包んで返す。
func (rp *RP) Exchange(ctx context.Context, orgID, code string, a Attempt) (Identity, error) {
	idp, p, err := rp.provider(ctx, orgID)
	if err != nil {
		return Identity{}, err
	}
	ctx = oidc.ClientContext(ctx, rp.client)
	tok, err := rp.config(idp, p).Exchange(ctx, code, oauth2.VerifierOption(a.CodeVerifier))
	if err != nil {
		return Identity{}, fmt.Errorf("%w: 認可コードを替えられない: %w", ErrInvalidToken, err)
	}
	raw, ok := tok.Extra("id_token").(string)
	if !ok || raw == "" {
		return Identity{}, fmt.Errorf("%w: id_token がない", ErrInvalidToken)
	}
	idt, err := p.Verifier(&oidc.Config{ClientID: idp.ClientID}).Verify(ctx, raw)
	if err != nil {
		return Identity{}, fmt.Errorf("%w: %w", ErrInvalidToken, err)
	}
	if idt.Nonce != a.Nonce {
		return Identity{}, fmt.Errorf("%w: nonce が違う", ErrInvalidToken)
	}
	var claims struct {
		Email         string `json:"email"`
		EmailVerified any    `json:"email_verified"`
	}
	if err := idt.Claims(&claims); err != nil {
		return Identity{}, fmt.Errorf("%w: %w", ErrInvalidToken, err)
	}
	return Identity{
		Issuer:        idt.Issuer,
		Subject:       idt.Subject,
		Email:         claims.Email,
		EmailVerified: isTrue(claims.EmailVerified),
	}, nil
}

// isTrue は、email_verified を真偽で読む。IdP によっては "true" の文字列で返すので、それも真とみなす。
func isTrue(v any) bool {
	switch b := v.(type) {
	case bool:
		return b
	case string:
		return b == "true"
	default:
		return false
	}
}
