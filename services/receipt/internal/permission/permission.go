// Package permission は、職員が照合の権限を持つかを、予定の API に問い合わせて確認する（ADR-0021）。
// 権限は予定の API だけが持つので、照合の API は職員の権限を保存しない。
package permission

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"slices"
	"time"
)

// ReceiptCheck は、照合を許す権限の code である。予定の API のマイグレーションが入れる値と同じにする。
const ReceiptCheck = "receipt.check"

// ErrForbidden は、職員が照合の権限を持たないか、予定の API が職員を拒んだことを表す。
var ErrForbidden = errors.New("照合の権限がない")

// Checker は、予定の API の GET /v1/me で、トークンの職員の権限を読む。
type Checker struct {
	me     string
	client *http.Client
}

// NewChecker は、baseURL の予定の API に問い合わせる Checker を返す。baseURL は `http://schedule:8080` の形で、パスを持たない。
func NewChecker(baseURL string) (*Checker, error) {
	u, err := url.Parse(baseURL)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
		return nil, fmt.Errorf("予定の API の URL が正しくない: %q", baseURL)
	}
	return &Checker{me: u.JoinPath("v1", "me").String(), client: &http.Client{Timeout: 10 * time.Second}}, nil
}

// RequireReceiptCheck は、token の職員が照合の権限を持てば nil を返す。
// 権限を持たないときと、予定の API が 401 か 403 を返したときは ErrForbidden を返す。
// 予定の API に届かないときと、ほかの状態を返したときは、ErrForbidden ではないエラーを返す。
func (c *Checker) RequireReceiptCheck(ctx context.Context, token string) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.me, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/json")
	res, err := c.client.Do(req)
	if err != nil {
		return fmt.Errorf("予定の API を呼べない: %w", err)
	}
	defer func() { _ = res.Body.Close() }()
	switch res.StatusCode {
	case http.StatusOK:
	case http.StatusUnauthorized, http.StatusForbidden:
		return ErrForbidden
	default:
		_, _ = io.Copy(io.Discard, io.LimitReader(res.Body, 1<<16))
		return fmt.Errorf("予定の API が %d を返した", res.StatusCode)
	}
	var me struct {
		Policies []policy `json:"policies"`
	}
	if err := json.NewDecoder(io.LimitReader(res.Body, 1<<20)).Decode(&me); err != nil {
		return fmt.Errorf("予定の API の職員を読めない: %w", err)
	}
	if !slices.ContainsFunc(me.Policies, func(p policy) bool { return p.Code == ReceiptCheck }) {
		return ErrForbidden
	}
	return nil
}

type policy struct {
	Code string `json:"code"`
}
