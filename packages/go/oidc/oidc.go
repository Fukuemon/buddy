// Package oidc は、Hydra が発行した access token の JWT を、Hydra の JWKS で検証する。
// 予定の API と照合の API が共有する module packages/go にある（ADR-0007）。
package oidc

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/MicahParks/keyfunc/v3"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/time/rate"
)

const (
	discoveryTimeout   = 10 * time.Second
	unknownKIDInterval = time.Minute
	// jwkset は、取り直しの HTTP のリクエストにも、この待ちの上限の ctx を使う。
	unknownKIDWait  = 5 * time.Second
	refreshInterval = time.Hour
	clockLeeway     = 30 * time.Second
	maxDiscoveryLen = 1 << 20
)

var allowedAlgs = []string{"RS256", "ES256"}

// Identity は、署名と有効期限を検証した access token の主張である。
// Email は、EmailVerified が true のときだけ、職員を結び付ける根拠に使える。
// OrgID は、ID ブローカーの組織の ID で、トークンに組織がないときは空である。
type Identity struct {
	Subject       string
	Email         string
	EmailVerified bool
	OrgID         string
}

// Config は、検証の設定である。
type Config struct {
	// Issuer は、Hydra の Issuer の URL で、トークンの iss と一致させる。
	Issuer string
	// Audience は、トークンの aud に含まれることを求める値である。
	Audience string
	// OrgClaim は、組織の ID を持つクレームの名前である。
	OrgClaim string
}

// Verifier は、access token を検証する。複数の goroutine から同時に使える。
type Verifier struct {
	cfg    Config
	keys   keyfunc.Keyfunc
	parser *jwt.Parser
}

// NewVerifier は、Issuer の discovery の文書から jwks_uri を読み、JWKS を取る Verifier を作る。
// discovery を読めないか、文書の issuer が Issuer と違うときはエラーを返す。JWKS を取れなくてもエラーにせず、
// 後のトークンの検証のときに取り直す。ctx が終わると、JWKS の定期の取り直しを止める。
// client が nil なら、リクエストごとに 10 秒で打ち切る client を使う。
func NewVerifier(ctx context.Context, cfg Config, client *http.Client, log *slog.Logger) (*Verifier, error) {
	if client == nil {
		client = &http.Client{Timeout: discoveryTimeout}
	}
	jwksURI, err := discover(ctx, client, cfg.Issuer)
	if err != nil {
		return nil, err
	}
	keys, err := keyfunc.NewDefaultOverrideCtx(ctx, []string{jwksURI}, keyfunc.Override{
		Client:            client,
		RefreshInterval:   refreshInterval,
		RefreshUnknownKID: rate.NewLimiter(rate.Every(unknownKIDInterval), 1),
		RateLimitWaitMax:  unknownKIDWait,
		RefreshErrorHandlerFunc: func(u string) func(context.Context, error) {
			return func(ctx context.Context, err error) {
				log.WarnContext(ctx, "refresh jwks", slog.String("url", u), slog.Any("error", err))
			}
		},
	})
	if err != nil {
		return nil, fmt.Errorf("init jwks: %w", err)
	}
	return &Verifier{
		cfg:  cfg,
		keys: keys,
		parser: jwt.NewParser(
			jwt.WithValidMethods(allowedAlgs),
			jwt.WithIssuer(cfg.Issuer),
			jwt.WithAudience(cfg.Audience),
			jwt.WithExpirationRequired(),
			jwt.WithLeeway(clockLeeway),
		),
	}, nil
}

// Verify は、raw の署名、iss、aud、exp、nbf を確認し、主張を返す。検証に失敗したときと sub がないときはエラーを返す。
// 組織のクレームがないか文字列でないときは、エラーにせず OrgID を空にする。
func (v *Verifier) Verify(ctx context.Context, raw string) (Identity, error) {
	claims := jwt.MapClaims{}
	if _, err := v.parser.ParseWithClaims(raw, claims, v.keys.KeyfuncCtx(ctx)); err != nil {
		return Identity{}, fmt.Errorf("verify token: %w", err)
	}
	sub, err := claims.GetSubject()
	if err != nil || sub == "" {
		return Identity{}, errors.New("verify token: sub がありません")
	}
	id := Identity{Subject: sub}
	id.Email, _ = claims["email"].(string)
	id.EmailVerified, _ = claims["email_verified"].(bool)
	id.OrgID, _ = claims[v.cfg.OrgClaim].(string)
	return id, nil
}

// discover は、OpenID Connect Discovery 1.0 のセクション 4 に従い、issuer の文書から jwks_uri を返す。
// https://openid.net/specs/openid-connect-discovery-1_0.html#ProviderConfig
func discover(ctx context.Context, client *http.Client, issuer string) (string, error) {
	ctx, cancel := context.WithTimeout(ctx, discoveryTimeout)
	defer cancel()
	u := strings.TrimSuffix(issuer, "/") + "/.well-known/openid-configuration"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return "", fmt.Errorf("discovery: %w", err)
	}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("discovery: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("discovery: %s が %d を返しました", u, resp.StatusCode)
	}
	var doc struct {
		Issuer  string `json:"issuer"`
		JWKSURI string `json:"jwks_uri"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, maxDiscoveryLen)).Decode(&doc); err != nil {
		return "", fmt.Errorf("discovery: %w", err)
	}
	if doc.Issuer != issuer {
		return "", fmt.Errorf("discovery: 文書の issuer %q が OIDC_ISSUER %q と違います", doc.Issuer, issuer)
	}
	if doc.JWKSURI == "" {
		return "", errors.New("discovery: jwks_uri がありません")
	}
	return doc.JWKSURI, nil
}
