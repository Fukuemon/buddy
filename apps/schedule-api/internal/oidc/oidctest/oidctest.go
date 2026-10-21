// Package oidctest は、テストと手元の確認に使う偽物の OIDC の発行者を持つ。
// 発行者は discovery の文書と JWKS を返し、自分の鍵でトークンに署名する。本番では使わない。
package oidctest

import (
	"crypto"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/rsa"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync"
	"time"

	"github.com/MicahParks/jwkset"
	"github.com/golang-jwt/jwt/v5"
)

// Issuer は、偽物の発行者である。http.Handler として discovery の文書と JWKS を返す。
// 複数の goroutine から同時に使える。
type Issuer struct {
	url    string
	server *httptest.Server

	mu           sync.Mutex
	published    []signingKey
	current      signingKey
	jwksRequests int
}

type signingKey struct {
	kid    string
	method jwt.SigningMethod
	priv   crypto.Signer
}

// New は、url を発行者の URL とし、ES256 の鍵を 1 つ公開した Issuer を作る。待ち受けは呼び出し側が行う。
func New(url string) (*Issuer, error) {
	i := &Issuer{url: url}
	if _, err := i.AddKey("ES256"); err != nil {
		return nil, err
	}
	return i, nil
}

// Start は、httptest のサーバーで待ち受ける Issuer を作る。呼び出し側は Close で止める。
func Start() (*Issuer, error) {
	i := &Issuer{}
	i.server = httptest.NewServer(i)
	i.url = i.server.URL
	if _, err := i.AddKey("ES256"); err != nil {
		i.server.Close()
		return nil, err
	}
	return i, nil
}

// Close は、Start で始めたサーバーを止める。
func (i *Issuer) Close() {
	if i.server != nil {
		i.server.Close()
	}
}

// URL は、発行者の URL を返す。
func (i *Issuer) URL() string { return i.url }

// Client は、Start で始めたサーバーに届く HTTP の client を返す。
func (i *Issuer) Client() *http.Client { return i.server.Client() }

// AddKey は、alg（RS256 か ES256）の鍵を作って JWKS に足し、以後の Sign に使う。新しい鍵の kid を返す。
func (i *Issuer) AddKey(alg string) (string, error) {
	k, err := newKey(alg)
	if err != nil {
		return "", err
	}
	i.mu.Lock()
	defer i.mu.Unlock()
	k.kid = fmt.Sprintf("key-%d", len(i.published)+1)
	i.published = append(i.published, k)
	i.current = k
	return k.kid, nil
}

// AddUnpublishedKey は、JWKS に載せない鍵を作り、以後の Sign に使う。署名の違うトークンを作るのに使う。
func (i *Issuer) AddUnpublishedKey(kid string) error {
	k, err := newKey("ES256")
	if err != nil {
		return err
	}
	k.kid = kid
	i.mu.Lock()
	defer i.mu.Unlock()
	i.current = k
	return nil
}

// JWKSRequests は、JWKS を返した回数を返す。
func (i *Issuer) JWKSRequests() int {
	i.mu.Lock()
	defer i.mu.Unlock()
	return i.jwksRequests
}

// Claims は、iss、aud、sub、iat、exp（5 分後）を入れた主張を返す。
func (i *Issuer) Claims(audience, subject string) jwt.MapClaims {
	now := time.Now()
	return jwt.MapClaims{
		"iss": i.url,
		"aud": audience,
		"sub": subject,
		"iat": now.Unix(),
		"exp": now.Add(5 * time.Minute).Unix(),
	}
}

// Sign は、今の署名の鍵で claims に署名したトークンを返す。ヘッダーの kid に鍵の kid を入れる。
func (i *Issuer) Sign(claims jwt.MapClaims) (string, error) {
	i.mu.Lock()
	k := i.current
	i.mu.Unlock()
	t := jwt.NewWithClaims(k.method, claims)
	t.Header["kid"] = k.kid
	return t.SignedString(k.priv)
}

// ServeHTTP は、/.well-known/openid-configuration と /jwks を返す。
func (i *Issuer) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	switch r.URL.Path {
	case "/.well-known/openid-configuration":
		writeJSON(w, map[string]string{"issuer": i.url, "jwks_uri": i.url + "/jwks"})
	case "/jwks":
		jwks, err := i.jwks()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, jwks)
	default:
		http.NotFound(w, r)
	}
}

func (i *Issuer) jwks() (jwkset.JWKSMarshal, error) {
	i.mu.Lock()
	defer i.mu.Unlock()
	i.jwksRequests++
	out := jwkset.JWKSMarshal{Keys: make([]jwkset.JWKMarshal, 0, len(i.published))}
	for _, k := range i.published {
		jwk, err := jwkset.NewJWKFromKey(k.priv.Public(), jwkset.JWKOptions{
			Metadata: jwkset.JWKMetadataOptions{KID: k.kid, ALG: jwkset.ALG(k.method.Alg()), USE: jwkset.UseSig},
		})
		if err != nil {
			return jwkset.JWKSMarshal{}, err
		}
		out.Keys = append(out.Keys, jwk.Marshal())
	}
	return out, nil
}

func newKey(alg string) (signingKey, error) {
	switch alg {
	case "ES256":
		priv, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
		return signingKey{method: jwt.SigningMethodES256, priv: priv}, err
	case "RS256":
		priv, err := rsa.GenerateKey(rand.Reader, 2048)
		return signingKey{method: jwt.SigningMethodRS256, priv: priv}, err
	default:
		return signingKey{}, fmt.Errorf("alg %q は RS256 か ES256 です", alg)
	}
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}
