package broker_test

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/broker"
)

type call struct {
	method, path, auth, body string
}

// newClient は、client credentials のトークンを出す Hydra と、受けた要求を calls に残して status と body を返すブローカーを立てる。
func newClient(t *testing.T, status int, body string, calls *[]call, tokenForm *string) *broker.Client {
	t.Helper()
	hydra := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = r.ParseForm()
		*tokenForm = r.PostForm.Encode()
		if id, secret, ok := r.BasicAuth(); !ok || id != "schedule" || secret != "schedule-secret" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"access_token":"client-token","token_type":"bearer","expires_in":300}`)
	}))
	t.Cleanup(hydra.Close)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		*calls = append(*calls, call{r.Method, r.URL.Path, r.Header.Get("Authorization"), string(b)})
		w.WriteHeader(status)
		_, _ = io.WriteString(w, body)
	}))
	t.Cleanup(srv.Close)
	return broker.New(broker.Config{
		URL: srv.URL + "/", TokenURL: hydra.URL + "/oauth2/token",
		ClientID: "schedule", ClientSecret: "schedule-secret", Audience: "broker",
	}, nil)
}

func TestRegister(t *testing.T) {
	ctx := context.Background()
	for _, tt := range []struct {
		status      int
		wantCreated bool
	}{
		{http.StatusCreated, true},
		{http.StatusOK, false},
	} {
		var calls []call
		var form string
		c := newClient(t, tt.status, `{"id":"01JBRKR0000000000000000000","org_id":"org-a","email":"a@example.com","status":"active"}`, &calls, &form)
		id, created, err := c.Register(ctx, "org-a", "a@example.com")
		if err != nil || id != "01JBRKR0000000000000000000" || created != tt.wantCreated {
			t.Fatalf("%d: Register = %q, %v, %v", tt.status, id, created, err)
		}
		want := call{http.MethodPost, "/internal/staff", "Bearer client-token", `{"email":"a@example.com","org_id":"org-a"}`}
		if calls[0] != want {
			t.Errorf("call = %+v, want %+v", calls[0], want)
		}
		if form != "audience=broker&grant_type=client_credentials" {
			t.Errorf("トークンの要求 = %q, want audience が broker の client credentials", form)
		}
	}
}

func TestErrors(t *testing.T) {
	ctx := context.Background()
	var calls []call
	var form string
	conflict := newClient(t, http.StatusConflict, `{"code":"suspended"}`, &calls, &form)
	if _, _, err := conflict.Register(ctx, "org-a", "a@example.com"); !errors.Is(err, apperr.ErrConflict) {
		t.Errorf("409 の Register の err = %v, want ErrConflict", err)
	}
	notFound := newClient(t, http.StatusNotFound, `{"code":"not_found"}`, &calls, &form)
	if err := notFound.Suspend(ctx, "01JBRKR0000000000000000000"); !errors.Is(err, apperr.ErrNotFound) {
		t.Errorf("404 の Suspend の err = %v, want ErrNotFound", err)
	}
	if err := notFound.Unregister(ctx, "01JBRKR0000000000000000000"); err != nil {
		t.Errorf("404 の Unregister の err = %v, want 消えているので成功", err)
	}
	down := newClient(t, http.StatusBadGateway, `{"code":"revoke_failed"}`, &calls, &form)
	if err := down.Suspend(ctx, "01JBRKR0000000000000000000"); err == nil || errors.Is(err, apperr.ErrNotFound) {
		t.Errorf("502 の Suspend の err = %v, want そのほかのエラー", err)
	}
}

func TestSuspendAndUnregister(t *testing.T) {
	ctx := context.Background()
	var calls []call
	var form string
	c := newClient(t, http.StatusNoContent, "", &calls, &form)
	if err := c.Suspend(ctx, "01JBRKR0000000000000000000"); err != nil {
		t.Fatal(err)
	}
	if err := c.Unregister(ctx, "01JBRKR0000000000000000000"); err != nil {
		t.Fatal(err)
	}
	want := []call{
		{http.MethodPost, "/internal/staff/01JBRKR0000000000000000000/suspend", "Bearer client-token", ""},
		{http.MethodDelete, "/internal/staff/01JBRKR0000000000000000000", "Bearer client-token", ""},
	}
	for i, w := range want {
		if calls[i] != w {
			t.Errorf("calls[%d] = %+v, want %+v", i, calls[i], w)
		}
	}
}
