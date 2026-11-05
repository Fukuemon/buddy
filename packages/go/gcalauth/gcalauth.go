// Package gcalauth は、組織ごとのサービスアカウントで Google Calendar API を呼ぶクライアントを作る（ADR-0009）。
// 予定の API と照合の API は、同じ形の設定（組織の ID とサービスアカウントのメールアドレスの対応）を読む。
package gcalauth

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"regexp"
	"strings"

	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"
	"google.golang.org/api/calendar/v3"
	"google.golang.org/api/impersonate"
	"google.golang.org/api/option"
)

// cloudPlatformScope は、なりすましの token を IAM Service Account Credentials API に求めるときの、元の認証のスコープである。
const cloudPlatformScope = "https://www.googleapis.com/auth/cloud-platform"

var (
	// ErrNoAccount は、組織にサービスアカウントの対応が無いことを表す。
	ErrNoAccount = errors.New("組織のサービスアカウントの設定が無い")
	// ErrToken は、サービスアカウントの token を作れないことを表す。元のエラーはサービスアカウントのメールアドレスを含むことがあるので包まない。
	ErrToken = errors.New("サービスアカウントの token を作れない")
)

// Accounts は、組織の ID から、その組織の事業所のカレンダーを読み書きするサービスアカウントのメールアドレスを引く。
type Accounts map[string]string

type account struct {
	OrgID          string `json:"org_id"`
	ServiceAccount string `json:"service_account"`
}

// LoadAccounts は、組織とサービスアカウントの対応を JSON のファイルから読む。
// 形は [{"org_id": "...", "service_account": "..."}] である。
// 一覧が空、org_id が空か重なる、service_account がメールアドレスの形でないか重なる、知らないキーがある、のいずれかではエラーを返す。
// 2 つの組織に同じサービスアカウントを割り当てると、組織の間でカレンダーを読めるので拒む（ADR-0009）。
// エラーの文には、サービスアカウントのメールアドレスを出さない。
func LoadAccounts(path string) (Accounts, error) {
	f, err := os.Open(path) //nolint:gosec // G304: 運営側が環境変数で渡す設定のファイルを読む
	if err != nil {
		return nil, err
	}
	defer func() { _ = f.Close() }()
	dec := json.NewDecoder(f)
	dec.DisallowUnknownFields()
	var accounts []account
	if err := dec.Decode(&accounts); err != nil {
		return nil, fmt.Errorf("サービスアカウントの設定 %s を読めない: %w", path, err)
	}
	if len(accounts) == 0 {
		return nil, fmt.Errorf("サービスアカウントの設定 %s が空である", path)
	}
	out := make(Accounts, len(accounts))
	used := make(map[string]bool, len(accounts))
	for i, a := range accounts {
		org, email := strings.TrimSpace(a.OrgID), strings.TrimSpace(a.ServiceAccount)
		switch {
		case org == "":
			return nil, fmt.Errorf("サービスアカウントの設定 %s の %d 件目の org_id が空である", path, i+1)
		case out[org] != "":
			return nil, fmt.Errorf("サービスアカウントの設定 %s の org_id %s が重なっている", path, org)
		case strings.Count(email, "@") != 1 || strings.HasPrefix(email, "@") || strings.HasSuffix(email, "@"):
			return nil, fmt.Errorf("サービスアカウントの設定 %s の org_id %s の service_account がメールアドレスの形でない", path, org)
		case used[strings.ToLower(email)]:
			return nil, fmt.Errorf("サービスアカウントの設定 %s の org_id %s の service_account が、ほかの組織と重なっている", path, org)
		}
		used[strings.ToLower(email)] = true
		out[org] = email
	}
	return out, nil
}

// Of は、組織 orgID のサービスアカウントのメールアドレスを返す。対応が無ければ false を返す。
func (a Accounts) Of(orgID string) (string, bool) {
	email, ok := a[orgID]
	return email, ok && orgID != ""
}

// Config は、Clients の設定である。
type Config struct {
	Accounts Accounts
	// Scope は、Calendar API を呼ぶ token のスコープである。
	Scope string
	// Endpoint は、Calendar API の代わりに呼ぶ URL で、フェイクに向けるときだけ持つ。
	// フェイクはなりすましの token を出せないので、GOOGLE_APPLICATION_CREDENTIALS で認証情報を渡したときは、
	// 全ての組織にその token をなりすまさずに使う。渡さなければ認証をしない。開発者の gcloud の ADC をフェイクに送らないためである。
	Endpoint string
}

// Clients は、組織ごとのサービスアカウントで Calendar API を呼ぶ calendar.Service を、サービスアカウントごとに 1 つ持つ。
// token は、サービスアカウントごとに有効期限まで使い回す。
type Clients struct {
	accounts Accounts
	services map[string]*calendar.Service
}

// New は、cfg.Accounts の全てのサービスアカウントの calendar.Service を作る。この時点では token を取らない。
// 認証は Application Default Credentials（ADC）で読み、事業所のサービスアカウントになりすます。
// ADC がすでに事業所のサービスアカウントとして動くとき（そのアカウントになりすました ADC か、そのアカウントのキーの ADC）は、
// 重ねてなりすまさず、ADC の token をそのまま使う。
func New(ctx context.Context, cfg Config) (*Clients, error) {
	// 認証情報は、渡した ctx を token の作り直しにも使う。止まる合図の後の書き出しの後片付けでも token を作れるよう、取り消しを外す。
	ctx = context.WithoutCancel(ctx)
	c := &Clients{accounts: cfg.Accounts, services: make(map[string]*calendar.Service, len(cfg.Accounts))}
	if cfg.Endpoint != "" {
		auth := option.WithoutAuthentication()
		if os.Getenv("GOOGLE_APPLICATION_CREDENTIALS") != "" {
			creds, err := google.FindDefaultCredentials(ctx, cfg.Scope)
			if err != nil {
				return nil, fmt.Errorf("application default credentials を読めない: %w", err)
			}
			auth = option.WithTokenSource(quietTokenSource{creds.TokenSource})
		}
		svc, err := calendar.NewService(ctx, option.WithEndpoint(cfg.Endpoint), auth)
		if err != nil {
			return nil, err
		}
		for _, email := range cfg.Accounts {
			c.services[email] = svc
		}
		return c, nil
	}
	base, err := google.FindDefaultCredentials(ctx, cloudPlatformScope)
	if err != nil {
		return nil, fmt.Errorf("application default credentials を読めない: %w", err)
	}
	self := adcAccount(base.JSON)
	for _, email := range cfg.Accounts {
		if c.services[email] != nil {
			continue
		}
		var ts oauth2.TokenSource
		if self != "" && strings.EqualFold(email, self) {
			creds, err := google.FindDefaultCredentials(ctx, cfg.Scope)
			if err != nil {
				return nil, fmt.Errorf("application default credentials を読めない: %w", err)
			}
			ts = creds.TokenSource
		} else {
			ts, err = impersonate.CredentialsTokenSource(ctx, impersonate.CredentialsConfig{
				TargetPrincipal: email, Scopes: []string{cfg.Scope},
			}, option.WithCredentials(base))
			if err != nil {
				return nil, err
			}
		}
		svc, err := calendar.NewService(ctx, option.WithTokenSource(quietTokenSource{ts}))
		if err != nil {
			return nil, err
		}
		c.services[email] = svc
	}
	return c, nil
}

// Account は、組織 orgID のサービスアカウントのメールアドレスを返す。対応が無ければ ErrNoAccount を返す。
func (c *Clients) Account(orgID string) (string, error) {
	email, ok := c.accounts.Of(orgID)
	if !ok {
		return "", ErrNoAccount
	}
	return email, nil
}

// Service は、組織 orgID のサービスアカウントで Calendar API を呼ぶ calendar.Service を返す。対応が無ければ ErrNoAccount を返す。
func (c *Clients) Service(orgID string) (*calendar.Service, error) {
	email, err := c.Account(orgID)
	if err != nil {
		return nil, err
	}
	return c.services[email], nil
}

// adcAccount は、ADC の JSON が、どのサービスアカウントとして Calendar API を呼ぶかを返す。
// サービスアカウントのキーなら client_email を、なりすましの ADC（impersonated_service_account）と、
// なりすましを伴う Workload Identity Federation（external_account）なら、なりすます先を返す。
// 利用者のアカウントと、JSON の無い ADC（メタデータサーバー）では空を返す。
func adcAccount(raw []byte) string {
	var f struct {
		Type                           string `json:"type"`
		ClientEmail                    string `json:"client_email"`
		ServiceAccountImpersonationURL string `json:"service_account_impersonation_url"`
	}
	if len(raw) == 0 || json.Unmarshal(raw, &f) != nil {
		return ""
	}
	switch f.Type {
	case "service_account":
		return f.ClientEmail
	case "impersonated_service_account", "external_account":
		if m := impersonationTarget.FindStringSubmatch(f.ServiceAccountImpersonationURL); m != nil {
			return m[1]
		}
	}
	return ""
}

// impersonationTarget は、なりすましの URL（.../projects/-/serviceAccounts/<メールアドレス>:generateAccessToken）からなりすます先を取る。
var impersonationTarget = regexp.MustCompile(`/serviceAccounts/([^/:]+):generateAccessToken$`)

// quietTokenSource は、token を作れないときのエラーを、サービスアカウントのメールアドレスを含まない ErrToken にする。
// IAM のレスポンスの本文は、権限借用の対象のリソースの名前を含むことがあり、ログに出せないためである。状態コードだけを残す。
type quietTokenSource struct{ ts oauth2.TokenSource }

// Token は、包んだ TokenSource の token を返す。
func (q quietTokenSource) Token() (*oauth2.Token, error) {
	tok, err := q.ts.Token()
	if err == nil {
		return tok, nil
	}
	var re *oauth2.RetrieveError
	if errors.As(err, &re) && re.Response != nil {
		return nil, fmt.Errorf("%w（状態コード %d）", ErrToken, re.Response.StatusCode)
	}
	if m := statusCode.FindStringSubmatch(err.Error()); m != nil {
		return nil, fmt.Errorf("%w（状態コード %s）", ErrToken, m[1])
	}
	return nil, ErrToken
}

// statusCode は、impersonate のエラーの文（impersonate: status code 403: ...）から状態コードを取る。
var statusCode = regexp.MustCompile(`status code (\d{3})`)
