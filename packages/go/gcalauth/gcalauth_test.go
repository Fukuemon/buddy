package gcalauth

import (
	"context"
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"golang.org/x/oauth2"
)

func writeFile(t *testing.T, body string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "accounts.json")
	if err := os.WriteFile(path, []byte(body), 0o600); err != nil {
		t.Fatal(err)
	}
	return path
}

func TestLoadAccounts(t *testing.T) {
	got, err := LoadAccounts(writeFile(t, `[
		{"org_id": "org-a", "service_account": "a@example.iam.gserviceaccount.com"},
		{"org_id": " org-b ", "service_account": " b@example.iam.gserviceaccount.com "}
	]`))
	if err != nil {
		t.Fatal(err)
	}
	if email, ok := got.Of("org-a"); !ok || email != "a@example.iam.gserviceaccount.com" {
		t.Errorf("org-a = %q, %v", email, ok)
	}
	if email, ok := got.Of("org-b"); !ok || email != "b@example.iam.gserviceaccount.com" {
		t.Errorf("org-b = %q, %v", email, ok)
	}
	if _, ok := got.Of("org-c"); ok {
		t.Error("org-c に対応がある")
	}
	if _, ok := got.Of(""); ok {
		t.Error("空の組織に対応がある")
	}
}

func TestLoadAccountsRejects(t *testing.T) {
	tests := []struct {
		name string
		body string
	}{
		{"空の一覧", `[]`},
		{"org_id が空", `[{"org_id": " ", "service_account": "a@example.iam.gserviceaccount.com"}]`},
		{"org_id が重なる", `[{"org_id": "org-a", "service_account": "a@example.iam.gserviceaccount.com"}, {"org_id": "org-a", "service_account": "b@example.iam.gserviceaccount.com"}]`},
		{"メールアドレスの形でない", `[{"org_id": "org-a", "service_account": "secret-account"}]`},
		{"@ で終わる", `[{"org_id": "org-a", "service_account": "secret-account@"}]`},
		{"service_account が重なる", `[{"org_id": "org-a", "service_account": "secret-account@example.iam.gserviceaccount.com"}, {"org_id": "org-b", "service_account": "Secret-Account@example.iam.gserviceaccount.com"}]`},
		{"知らないキー", `[{"org_id": "org-a", "service_account": "a@example.iam.gserviceaccount.com", "key": "x"}]`},
		{"JSON でない", `{`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := LoadAccounts(writeFile(t, tt.body))
			if err == nil {
				t.Fatal("エラーが無い")
			}
			if strings.Contains(err.Error(), "secret-account") {
				t.Errorf("エラーの文にサービスアカウントが出ている: %v", err)
			}
		})
	}
}

func TestADCAccount(t *testing.T) {
	tests := []struct {
		name string
		json string
		want string
	}{
		{"なりすましの ADC", `{"type": "impersonated_service_account", "service_account_impersonation_url": "https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/dev@example.iam.gserviceaccount.com:generateAccessToken", "source_credentials": {"type": "authorized_user"}}`, "dev@example.iam.gserviceaccount.com"},
		{"サービスアカウントのキー", `{"type": "service_account", "client_email": "key@example.iam.gserviceaccount.com"}`, "key@example.iam.gserviceaccount.com"},
		{"なりすましを伴う Workload Identity Federation", `{"type": "external_account", "service_account_impersonation_url": "https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/wif@example.iam.gserviceaccount.com:generateAccessToken"}`, "wif@example.iam.gserviceaccount.com"},
		{"なりすましの無い Workload Identity Federation", `{"type": "external_account"}`, ""},
		{"利用者のアカウント", `{"type": "authorized_user", "client_id": "x"}`, ""},
		{"JSON が無い（メタデータサーバー）", ``, ""},
		{"壊れた JSON", `{`, ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := adcAccount([]byte(tt.json)); got != tt.want {
				t.Errorf("adcAccount = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestClientsWithEndpoint(t *testing.T) {
	// 認証情報を渡さない環境と、フェイクの利用者の認証情報を渡した環境の両方で作れる
	t.Run("認証情報を渡さない", func(t *testing.T) {
		t.Setenv("GOOGLE_APPLICATION_CREDENTIALS", "")
		testClientsWithEndpoint(t)
	})
	t.Run("フェイクの利用者の ADC", func(t *testing.T) {
		t.Setenv("GOOGLE_APPLICATION_CREDENTIALS", writeFile(t, `{"type": "authorized_user", "client_id": "c", "client_secret": "s", "refresh_token": "r", "token_uri": "http://127.0.0.1:1/token"}`))
		testClientsWithEndpoint(t)
	})
}

func testClientsWithEndpoint(t *testing.T) {
	t.Helper()
	accounts := Accounts{"org-a": "a@example.iam.gserviceaccount.com", "org-b": "b@example.iam.gserviceaccount.com"}
	c, err := New(context.Background(), Config{Accounts: accounts, Scope: "scope", Endpoint: "http://127.0.0.1:1/"})
	if err != nil {
		t.Fatal(err)
	}
	if email, err := c.Account("org-b"); err != nil || email != "b@example.iam.gserviceaccount.com" {
		t.Errorf("Account(org-b) = %q, %v", email, err)
	}
	if svc, err := c.Service("org-a"); err != nil || svc == nil {
		t.Errorf("Service(org-a) = %v, %v", svc, err)
	}
	if _, err := c.Account("org-c"); !errors.Is(err, ErrNoAccount) {
		t.Errorf("Account(org-c) = %v", err)
	}
	if _, err := c.Service("org-c"); !errors.Is(err, ErrNoAccount) {
		t.Errorf("Service(org-c) = %v", err)
	}
}

type failingSource struct{ err error }

func (f failingSource) Token() (*oauth2.Token, error) { return nil, f.err }

func TestQuietTokenSource(t *testing.T) {
	tests := []struct {
		name string
		err  error
		want string
	}{
		{"impersonate の誤り", errors.New("impersonate: status code 403: Permission denied on resource projects/-/serviceAccounts/secret@example.iam.gserviceaccount.com"), "状態コード 403"},
		{"token の応答の誤り", &oauth2.RetrieveError{Response: &http.Response{StatusCode: http.StatusUnauthorized}, Body: []byte("secret@example.iam.gserviceaccount.com")}, "状態コード 401"},
		{"状態コードの無い誤り", errors.New("dial secret@example.iam.gserviceaccount.com"), ErrToken.Error()},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := quietTokenSource{failingSource{tt.err}}.Token()
			if !errors.Is(err, ErrToken) {
				t.Fatalf("err = %v", err)
			}
			if strings.Contains(err.Error(), "secret") {
				t.Errorf("誤りの文にサービスアカウントが出ている: %v", err)
			}
			if !strings.Contains(err.Error(), tt.want) {
				t.Errorf("err = %v, want %q を含む", err, tt.want)
			}
		})
	}
}
