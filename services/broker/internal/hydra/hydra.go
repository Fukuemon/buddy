// Package hydra は、Ory Hydra の admin API のうち、ログインと同意の要求を読み、accept と reject を返す呼び出しと、
// 職員のログインのセッションと同意を取り消す呼び出しを持つ（ADR-0016、ADR-0017）。
package hydra

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// requestTimeout は、admin API の 1 回の呼び出しを待つ上限である。
const requestTimeout = 10 * time.Second

// maxResponseLen は、admin API のレスポンスを読む上限である。
const maxResponseLen = 1 << 20

// Client は、Hydra の admin API を呼ぶ。複数の goroutine から同時に使える。
type Client struct {
	adminURL string
	http     *http.Client
}

// New は、admin API の URL adminURL を呼ぶ Client を作る。client が nil なら、10 秒で打ち切る client を使う。
func New(adminURL string, client *http.Client) *Client {
	if client == nil {
		client = &http.Client{Timeout: requestTimeout}
	}
	return &Client{adminURL: strings.TrimSuffix(adminURL, "/"), http: client}
}

// OAuth2Client は、要求を出したクライアントのうち、ブローカーが使う値である。
type OAuth2Client struct {
	ClientID string   `json:"client_id"`
	Audience []string `json:"audience"`
}

// LoginRequest は、Hydra がブローカーのログインの画面に渡す要求である。
// Skip が true なら、Hydra は Subject のログインのセッションを覚えていて、ブローカーは画面を出さずに accept する。
type LoginRequest struct {
	Challenge string       `json:"challenge"`
	Skip      bool         `json:"skip"`
	Subject   string       `json:"subject"`
	Client    OAuth2Client `json:"client"`
}

// AcceptLogin は、ログインの accept の本文である。
type AcceptLogin struct {
	// Subject は、トークンの sub になる値で、ブローカーの職員の ID である。
	Subject string `json:"subject"`
	// Remember が true なら、Hydra はログインのセッションを RememberFor 秒だけ覚える。
	Remember    bool `json:"remember"`
	RememberFor int  `json:"remember_for,omitempty"`
}

// ConsentRequest は、Hydra がブローカーの同意の画面に渡す要求である。
type ConsentRequest struct {
	Challenge      string       `json:"challenge"`
	Subject        string       `json:"subject"`
	RequestedScope []string     `json:"requested_scope"`
	Client         OAuth2Client `json:"client"`
}

// AcceptConsent は、同意の accept の本文である。
type AcceptConsent struct {
	GrantScope    []string `json:"grant_scope"`
	GrantAudience []string `json:"grant_access_token_audience"`
	Session       Session  `json:"session"`
}

// Session は、Hydra が発行するトークンに足すクレームである。
// access token の JWT では ext の下に入り、oauth2.allowed_top_level_claims に挙げたものは top level にも出る。
type Session struct {
	AccessToken map[string]any `json:"access_token,omitempty"`
	IDToken     map[string]any `json:"id_token,omitempty"`
}

// Rejection は、ログインと同意の reject の本文である。Error は OAuth 2.0 のエラーの値で、クライアントの redirect_uri に渡る。
type Rejection struct {
	Error            string `json:"error"`
	ErrorDescription string `json:"error_description,omitempty"`
}

// AccessDenied は、職員にトークンを出さないときの reject である。理由はクライアントに伝えない。
var AccessDenied = Rejection{Error: "access_denied", ErrorDescription: "ログインできませんでした"}

// LoginRequest は、login_challenge の要求を読む。
func (c *Client) LoginRequest(ctx context.Context, challenge string) (LoginRequest, error) {
	var out LoginRequest
	err := c.do(ctx, http.MethodGet, "/admin/oauth2/auth/requests/login", url.Values{"login_challenge": {challenge}}, nil, &out)
	return out, err
}

// AcceptLogin は、ログインを受け入れ、ブラウザを転送する先を返す。
func (c *Client) AcceptLogin(ctx context.Context, challenge string, body AcceptLogin) (string, error) {
	return c.redirect(ctx, "/admin/oauth2/auth/requests/login/accept", "login_challenge", challenge, body)
}

// RejectLogin は、ログインを拒み、ブラウザを転送する先を返す。
func (c *Client) RejectLogin(ctx context.Context, challenge string, body Rejection) (string, error) {
	return c.redirect(ctx, "/admin/oauth2/auth/requests/login/reject", "login_challenge", challenge, body)
}

// ConsentRequest は、consent_challenge の要求を読む。
func (c *Client) ConsentRequest(ctx context.Context, challenge string) (ConsentRequest, error) {
	var out ConsentRequest
	err := c.do(ctx, http.MethodGet, "/admin/oauth2/auth/requests/consent", url.Values{"consent_challenge": {challenge}}, nil, &out)
	return out, err
}

// AcceptConsent は、同意を受け入れ、ブラウザを転送する先を返す。
func (c *Client) AcceptConsent(ctx context.Context, challenge string, body AcceptConsent) (string, error) {
	return c.redirect(ctx, "/admin/oauth2/auth/requests/consent/accept", "consent_challenge", challenge, body)
}

// RejectConsent は、同意を拒み、ブラウザを転送する先を返す。
func (c *Client) RejectConsent(ctx context.Context, challenge string, body Rejection) (string, error) {
	return c.redirect(ctx, "/admin/oauth2/auth/requests/consent/reject", "consent_challenge", challenge, body)
}

// RevokeLoginSessions は、職員 subject のログインのセッションを全て消す。Hydra は、次の認可でログインの画面を呼ぶ。
func (c *Client) RevokeLoginSessions(ctx context.Context, subject string) error {
	return c.do(ctx, http.MethodDelete, "/admin/oauth2/auth/sessions/login", url.Values{"subject": {subject}}, nil, nil)
}

// RevokeConsentSessions は、職員 subject の全てのクライアントへの同意を消す。Hydra は、同意から発行した
// access token と refresh token も取り消すので、refresh token でトークンを取り直せなくなる。
func (c *Client) RevokeConsentSessions(ctx context.Context, subject string) error {
	return c.do(ctx, http.MethodDelete, "/admin/oauth2/auth/sessions/consent", url.Values{"subject": {subject}, "all": {"true"}}, nil, nil)
}

func (c *Client) redirect(ctx context.Context, path, param, challenge string, body any) (string, error) {
	var out struct {
		RedirectTo string `json:"redirect_to"`
	}
	if err := c.do(ctx, http.MethodPut, path, url.Values{param: {challenge}}, body, &out); err != nil {
		return "", err
	}
	if out.RedirectTo == "" {
		return "", fmt.Errorf("hydra %s: redirect_to がありません", path)
	}
	return out.RedirectTo, nil
}

// do は、admin API の path にクエリ query を付けて呼び、2xx のレスポンスの JSON を out に読む。out が nil なら本文を読まない。
func (c *Client) do(ctx context.Context, method, path string, query url.Values, body, out any) error {
	var reqBody io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return fmt.Errorf("hydra %s: %w", path, err)
		}
		reqBody = bytes.NewReader(b)
	}
	u := c.adminURL + path + "?" + query.Encode()
	req, err := http.NewRequestWithContext(ctx, method, u, reqBody)
	if err != nil {
		return fmt.Errorf("hydra %s: %w", path, err)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("hydra %s: %w", path, err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode/100 != 2 {
		// 本文は Hydra のエラーの JSON で、秘密の値を含まない
		msg, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))
		return fmt.Errorf("hydra %s: %d %s", path, resp.StatusCode, bytes.TrimSpace(msg))
	}
	if out == nil {
		return nil
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, maxResponseLen)).Decode(out); err != nil {
		return fmt.Errorf("hydra %s: %w", path, err)
	}
	return nil
}
