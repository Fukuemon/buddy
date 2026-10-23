// Package broker は、認証のブローカーの内部の API（職員の登録、削除、停止）を呼ぶ（ADR-0017）。
// 内部の API は、Hydra の client credentials の access token（aud は broker）で呼ぶ。
package broker

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"golang.org/x/oauth2"
	"golang.org/x/oauth2/clientcredentials"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
)

// requestTimeout は、トークンの取得と内部の API の 1 回の呼び出しを待つ上限である。
const requestTimeout = 10 * time.Second

// maxResponseLen は、内部の API のレスポンスを読む上限である。
const maxResponseLen = 1 << 16

// Config は、ブローカーの内部の API を呼ぶ設定である。
type Config struct {
	// URL は、ブローカーの URL である。
	URL string
	// TokenURL は、Hydra のトークンのエンドポイントである。
	TokenURL string
	// ClientID と ClientSecret は、Hydra に登録した予定の API のクライアントである。
	ClientID     string
	ClientSecret string
	// Audience は、access token の aud に求める値で、ブローカーが求める値と同じにする。
	Audience string
}

// Client は、ブローカーの内部の API を呼ぶ。staff.Identities の約束を満たす。複数の goroutine から同時に使える。
type Client struct {
	url  string
	http *http.Client
}

// New は、cfg のクライアントで access token を取り、期限まで使い回して内部の API を呼ぶ Client を作る。
// base が nil なら、10 秒で打ち切る client でトークンと内部の API を呼ぶ。
func New(cfg Config, base *http.Client) *Client {
	if base == nil {
		base = &http.Client{Timeout: requestTimeout}
	}
	cc := clientcredentials.Config{
		ClientID:       cfg.ClientID,
		ClientSecret:   cfg.ClientSecret,
		TokenURL:       cfg.TokenURL,
		EndpointParams: url.Values{"audience": {cfg.Audience}},
	}
	ctx := context.WithValue(context.Background(), oauth2.HTTPClient, base)
	c := cc.Client(ctx)
	c.Timeout = base.Timeout
	return &Client{url: strings.TrimSuffix(cfg.URL, "/"), http: c}
}

// staff は、内部の API の職員である。
type staff struct {
	ID string `json:"id"`
}

// Register は、組織 orgID にメール email の職員を登録し、その ID と、新しく作ったかを返す。
// 同じ組織に同じメールの職員がいれば、作らずにその ID と false を返す。その職員が止められていれば apperr.ErrConflict を返す。
func (c *Client) Register(ctx context.Context, orgID, email string) (string, bool, error) {
	body, err := json.Marshal(map[string]string{"org_id": orgID, "email": email})
	if err != nil {
		return "", false, fmt.Errorf("broker register: %w", err)
	}
	var out staff
	code, err := c.do(ctx, http.MethodPost, "/internal/staff", body, &out)
	if err != nil {
		return "", false, err
	}
	if out.ID == "" {
		return "", false, errors.New("broker register: 職員の ID がありません")
	}
	return out.ID, code == http.StatusCreated, nil
}

// Unregister は、上流のアカウントを結び付けていない職員 id を消す。いなければ成功とみなす。
func (c *Client) Unregister(ctx context.Context, id string) error {
	_, err := c.do(ctx, http.MethodDelete, "/internal/staff/"+url.PathEscape(id), nil, nil)
	if errors.Is(err, apperr.ErrNotFound) {
		return nil
	}
	return err
}

// Suspend は、職員 id を止め、ログインのセッション、同意、refresh token を取り消させる。いなければ apperr.ErrNotFound を返す。
func (c *Client) Suspend(ctx context.Context, id string) error {
	_, err := c.do(ctx, http.MethodPost, "/internal/staff/"+url.PathEscape(id)+"/suspend", nil, nil)
	return err
}

// do は、内部の API を呼び、2xx の状態コードを返す。out が nil でなければ本文の JSON を読む。
// 404 は apperr.ErrNotFound を、409 は apperr.ErrConflict を包んで返す。
func (c *Client) do(ctx context.Context, method, path string, body []byte, out any) (int, error) {
	var reqBody io.Reader
	if body != nil {
		reqBody = bytes.NewReader(body)
	}
	req, err := http.NewRequestWithContext(ctx, method, c.url+path, reqBody)
	if err != nil {
		return 0, fmt.Errorf("broker %s %s: %w", method, path, err)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return 0, fmt.Errorf("broker %s %s: %w", method, path, err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode/100 != 2 {
		// 本文はブローカーのエラーの JSON で、秘密の値を含まない
		msg, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))
		err := fmt.Errorf("broker %s %s: %d %s", method, path, resp.StatusCode, bytes.TrimSpace(msg))
		switch resp.StatusCode {
		case http.StatusNotFound:
			return 0, fmt.Errorf("%w: %w", apperr.ErrNotFound, err)
		case http.StatusConflict:
			return 0, fmt.Errorf("%w: %w", apperr.ErrConflict, err)
		}
		return 0, err
	}
	if out != nil {
		if err := json.NewDecoder(io.LimitReader(resp.Body, maxResponseLen)).Decode(out); err != nil {
			return 0, fmt.Errorf("broker %s %s: %w", method, path, err)
		}
	}
	return resp.StatusCode, nil
}
