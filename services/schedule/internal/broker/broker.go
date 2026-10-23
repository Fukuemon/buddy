// Package broker は、認証のブローカーの内部の API（職員の登録、有効化、削除、停止）を呼ぶ（ADR-0017）。
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
	"github.com/Fukuemon/buddy/services/schedule/internal/staff"
)

// requestTimeout は、トークンの取得と内部の API の 1 回の呼び出しを待つ上限である。
const requestTimeout = 10 * time.Second

// maxResponseLen は、内部の API のレスポンスを読む上限である。
const maxResponseLen = 1 << 16

// Config は、ブローカーの内部の API を呼ぶ設定である。
type Config struct {
	// URL は、ブローカーの内部の API の URL である。ログインの画面と別のポートで待ち受ける。
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

// staffBody は、内部の API の職員である。
type staffBody struct {
	ID     string `json:"id"`
	Status string `json:"status"`
}

// errorBody は、内部の API のエラーの本文である。
type errorBody struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// Register は、組織 orgID にメール email の職員を登録の途中の状態で登録し、その ID と、新しく作ったかと、登録の途中かを返す。
// 同じ組織に同じメールの職員がいれば、作らずにその職員を返す。その職員が止められていれば staff.ErrIdentitySuspended を、
// ほかの組織に同じメールの職員がいれば staff.ErrEmailTaken を返す。
func (c *Client) Register(ctx context.Context, orgID, email string) (staff.Registration, error) {
	body, err := json.Marshal(map[string]string{"org_id": orgID, "email": email})
	if err != nil {
		return staff.Registration{}, fmt.Errorf("broker register: %w", err)
	}
	var out staffBody
	code, err := c.do(ctx, http.MethodPost, "/internal/staff", body, &out)
	if err != nil {
		return staff.Registration{}, err
	}
	if out.ID == "" {
		return staff.Registration{}, errors.New("broker register: 職員の ID がありません")
	}
	return staff.Registration{ID: out.ID, Created: code == http.StatusCreated, Pending: out.Status == "pending"}, nil
}

// Activate は、登録の途中の職員 id を有効にする。止めた職員なら staff.ErrIdentitySuspended を返す。
func (c *Client) Activate(ctx context.Context, id string) error {
	_, err := c.do(ctx, http.MethodPost, "/internal/staff/"+url.PathEscape(id)+"/activate", nil, nil)
	return err
}

// Unregister は、登録の途中の職員 id を消す。いないか、登録の途中でなければ、消さずに成功とみなす。
func (c *Client) Unregister(ctx context.Context, id string) error {
	_, err := c.do(ctx, http.MethodDelete, "/internal/staff/"+url.PathEscape(id), nil, nil)
	if errors.Is(err, apperr.ErrNotFound) || errors.Is(err, apperr.ErrConflict) {
		return nil
	}
	return err
}

// Suspend は、職員 id を止め、ログインのセッション、同意、refresh token を取り消させる。いなければ apperr.ErrNotFound を、
// 止めたが取り消せなければ staff.ErrRevokeFailed を返す。
func (c *Client) Suspend(ctx context.Context, id string) error {
	_, err := c.do(ctx, http.MethodPost, "/internal/staff/"+url.PathEscape(id)+"/suspend", nil, nil)
	return err
}

// do は、内部の API を呼び、2xx の状態コードを返す。out が nil でなければ本文の JSON を読む。
// 400 は本文の文で apperr.Invalid を、404 は apperr.ErrNotFound を包んで返す。409 は、本文の code が email_taken なら
// staff.ErrEmailTaken を、suspended なら staff.ErrIdentitySuspended を、ほかは apperr.ErrConflict を包んで返す。
// 502 は、本文の code が revoke_failed なら staff.ErrRevokeFailed を包んで返す。
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
		var e errorBody
		_ = json.Unmarshal(msg, &e)
		err := fmt.Errorf("broker %s %s: %d %s", method, path, resp.StatusCode, bytes.TrimSpace(msg))
		switch {
		case resp.StatusCode == http.StatusBadRequest:
			return 0, apperr.Invalid("認証のブローカーが受け付けません: %s", e.Message)
		case resp.StatusCode == http.StatusNotFound:
			return 0, fmt.Errorf("%w: %w", apperr.ErrNotFound, err)
		case resp.StatusCode == http.StatusConflict && e.Code == "email_taken":
			return 0, fmt.Errorf("%w: %w", staff.ErrEmailTaken, err)
		case resp.StatusCode == http.StatusConflict && e.Code == "suspended":
			return 0, fmt.Errorf("%w: %w", staff.ErrIdentitySuspended, err)
		case resp.StatusCode == http.StatusConflict:
			return 0, fmt.Errorf("%w: %w", apperr.ErrConflict, err)
		case resp.StatusCode == http.StatusBadGateway && e.Code == "revoke_failed":
			return 0, fmt.Errorf("%w: %w", staff.ErrRevokeFailed, err)
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
