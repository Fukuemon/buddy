package hydra_test

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/Fukuemon/buddy/services/broker/internal/hydra"
)

type call struct {
	method, path, query, body string
}

// fakeAdmin は、受けたリクエストを calls に残し、status と body を返す admin API である。
func fakeAdmin(t *testing.T, status int, body string, calls *[]call) *hydra.Client {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		*calls = append(*calls, call{r.Method, r.URL.Path, r.URL.RawQuery, string(b)})
		w.WriteHeader(status)
		_, _ = io.WriteString(w, body)
	}))
	t.Cleanup(srv.Close)
	return hydra.New(srv.URL+"/", srv.Client())
}

func TestLoginRequest(t *testing.T) {
	var calls []call
	c := fakeAdmin(t, http.StatusOK, `{"challenge":"ch","skip":true,"subject":"s1","client":{"client_id":"web","audience":["schedule"]}}`, &calls)
	got, err := c.LoginRequest(context.Background(), "ch&x")
	if err != nil {
		t.Fatal(err)
	}
	want := hydra.LoginRequest{Challenge: "ch", Skip: true, Subject: "s1", Client: hydra.OAuth2Client{ClientID: "web", Audience: []string{"schedule"}}}
	if got.Challenge != want.Challenge || !got.Skip || got.Subject != want.Subject || got.Client.Audience[0] != "schedule" {
		t.Errorf("got %+v, want %+v", got, want)
	}
	if calls[0] != (call{http.MethodGet, "/admin/oauth2/auth/requests/login", "login_challenge=ch%26x", ""}) {
		t.Errorf("call = %+v", calls[0])
	}
}

func TestAcceptConsent(t *testing.T) {
	var calls []call
	c := fakeAdmin(t, http.StatusOK, `{"redirect_to":"http://hydra/next"}`, &calls)
	to, err := c.AcceptConsent(context.Background(), "ch", hydra.AcceptConsent{
		GrantScope:    []string{"openid"},
		GrantAudience: []string{"schedule", "receipt"},
		Session:       hydra.Session{AccessToken: map[string]any{"org_id": "org-a"}},
	})
	if err != nil || to != "http://hydra/next" {
		t.Fatalf("to = %q, err = %v", to, err)
	}
	got := calls[0]
	if got.method != http.MethodPut || got.path != "/admin/oauth2/auth/requests/consent/accept" || got.query != "consent_challenge=ch" {
		t.Errorf("call = %+v", got)
	}
	var body map[string]any
	if err := json.Unmarshal([]byte(got.body), &body); err != nil {
		t.Fatal(err)
	}
	session, _ := body["session"].(map[string]any)
	at, _ := session["access_token"].(map[string]any)
	if at["org_id"] != "org-a" || len(body["grant_access_token_audience"].([]any)) != 2 {
		t.Errorf("body = %s", got.body)
	}
}

func TestErrors(t *testing.T) {
	tests := []struct {
		name   string
		status int
		body   string
		want   string
	}{
		{"2xx でない", http.StatusNotFound, `{"error":"Not Found"}`, "404"},
		{"redirect_to が無い", http.StatusOK, `{}`, "redirect_to"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var calls []call
			c := fakeAdmin(t, tt.status, tt.body, &calls)
			_, err := c.RejectLogin(context.Background(), "ch", hydra.AccessDenied)
			if err == nil || !strings.Contains(err.Error(), tt.want) {
				t.Errorf("err = %v, want %q を含むエラー", err, tt.want)
			}
		})
	}
}
