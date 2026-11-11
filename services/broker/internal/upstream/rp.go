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

// discoveryRetryAfter は、discovery の文書を読めなかった事業所で、読み直さずに同じ失敗を返す間である。
// 応答しない IdP を、ログインの試行のたびに 10 秒待たないようにする。
const discoveryRetryAfter = 30 * time.Second

// Identity は、上流の IdP の ID token から読んだ、職員の照合に使う主張である。
type Identity struct {
	Issuer        string
	Subject       string
	Email         string
	EmailVerified bool
}

// Attempt は、上流の IdP へリダイレクトする 1 回のログインの値である。ブラウザの cookie に置き、コールバックで照合する。
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
// 複数の goroutine から同時に使える。1 つの事業所の IdP が応答しなくても、ほかの事業所の IdP の discovery を待たせない。
type RP struct {
	idps        IdPs
	redirectURL string
	// browserOrigin が空でなければ、認可のエンドポイントの scheme とホストをこれに替える。
	browserOrigin *url.URL
	client        *http.Client
	now           func() time.Time

	// mu は providers の map だけを守る。discovery の文書を読む間は、事業所ごとの discovery.mu を握る
	mu        sync.Mutex
	providers map[string]*discovery
}

// discovery は、1 つの事業所の discovery の文書か、直前に読めなかったときの失敗である。
type discovery struct {
	mu       sync.Mutex
	provider *oidc.Provider
	err      error
	failedAt time.Time
}

// NewRP は、redirectURL をコールバックにして、ブラウザを idps の上流の IdP へリダイレクトする RP を作る。
//
// browserOrigin は、ローカル環境のように、ブローカーが discovery を読む issuer の URL にブラウザが届かないときだけ渡す。
// 認可のエンドポイントの scheme とホストを browserOrigin に替えて、ブラウザをリダイレクトする。空なら替えない。
// client が nil なら、上流の IdP へのリクエストを 10 秒で打ち切る client を使う。
func NewRP(idps IdPs, redirectURL, browserOrigin string, client *http.Client) (*RP, error) {
	rp := &RP{
		idps: idps, redirectURL: redirectURL, client: client,
		now: time.Now, providers: map[string]*discovery{},
	}
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

// provider は、事業所 orgID の上流の IdP の discovery の文書を返す。
// 読めなかったときは、その失敗を discoveryRetryAfter の間だけ覚えて返し、過ぎてから読み直す。
func (rp *RP) provider(ctx context.Context, orgID string) (IdP, *oidc.Provider, error) {
	idp, ok := rp.idps.Of(orgID)
	if !ok {
		return IdP{}, nil, fmt.Errorf("組織 %s の上流の IdP の設定がない", orgID)
	}
	rp.mu.Lock()
	d, ok := rp.providers[orgID]
	if !ok {
		d = &discovery{}
		rp.providers[orgID] = d
	}
	rp.mu.Unlock()

	// 同じ事業所への同時のログインは、1 つの読み込みを待つ
	d.mu.Lock()
	defer d.mu.Unlock()
	if d.provider != nil {
		return idp, d.provider, nil
	}
	if d.err != nil && rp.now().Sub(d.failedAt) < discoveryRetryAfter {
		return IdP{}, nil, d.err
	}
	// ブラウザが接続を切っても読み込みを続け、待っているほかのログインに途中で切った失敗を返さない
	ctx, cancel := context.WithTimeout(oidc.ClientContext(context.WithoutCancel(ctx), rp.client), discoveryTimeout)
	defer cancel()
	p, err := oidc.NewProvider(ctx, idp.Issuer)
	if err != nil {
		d.err, d.failedAt = fmt.Errorf("組織 %s の上流の IdP の discovery: %w", orgID, err), rp.now()
		return IdP{}, nil, d.err
	}
	d.provider, d.err = p, nil
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

// ErrHostedDomain は、検証した ID token の hd が、事業所の許すドメインと合わないことを示す。
// 職員が事業所の Google Workspace と違うアカウントで入ったときで、ID token の検証の失敗とは分ける。
var ErrHostedDomain = errors.New("上流のアカウントの hd が許すドメインと違う")

// Exchange は、事業所 orgID の上流の IdP の認可コード code を ID token に替えて検証し、主張を返す。
// iss は認可レスポンスの iss パラメーター（RFC 9207）で、空でなければ、認可コードを替える前に設定の issuer と比べる。
// ID token の署名、iss、aud、exp、nonce を確認する。iss が違うとき、トークンを取れないとき、検証に失敗したときは
// ErrInvalidToken を包んで返す。
func (rp *RP) Exchange(ctx context.Context, orgID, code, iss string, a Attempt) (Identity, error) {
	idp, p, err := rp.provider(ctx, orgID)
	if err != nil {
		return Identity{}, err
	}
	// 別の IdP の認可レスポンスを、この事業所の IdP のものとして受けないようにする（mix-up の攻撃）
	if iss != "" && iss != idp.Issuer {
		return Identity{}, fmt.Errorf("%w: 認可レスポンスの iss %q が設定の issuer と違う", ErrInvalidToken, iss)
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
