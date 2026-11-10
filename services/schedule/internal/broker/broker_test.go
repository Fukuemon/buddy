package broker_test

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/broker"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/staff"
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
		status  int
		state   string
		wantReg staff.Registration
	}{
		{http.StatusCreated, "pending", staff.Registration{ID: "01JBRKR0000000000000000000", Created: true, Pending: true}},
		{http.StatusOK, "pending", staff.Registration{ID: "01JBRKR0000000000000000000", Pending: true}},
		{http.StatusOK, "active", staff.Registration{ID: "01JBRKR0000000000000000000"}},
	} {
		var calls []call
		var form string
		c := newClient(t, tt.status, `{"id":"01JBRKR0000000000000000000","org_id":"org-a","email":"a@example.com","status":"`+tt.state+`"}`, &calls, &form)
		reg, err := c.Register(ctx, "org-a", "a@example.com")
		if err != nil || reg != tt.wantReg {
			t.Fatalf("%d %s: Register = %+v, %v, want %+v", tt.status, tt.state, reg, err, tt.wantReg)
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
	for _, tt := range []struct {
		code string
		want error
	}{
		{"suspended", staff.ErrIdentitySuspended},
		{"email_taken", staff.ErrEmailTaken},
		{"other", apperr.ErrConflict},
	} {
		conflict := newClient(t, http.StatusConflict, `{"code":"`+tt.code+`"}`, &calls, &form)
		if _, err := conflict.Register(ctx, "org-a", "a@example.com"); !errors.Is(err, tt.want) {
			t.Errorf("409 %s の Register の err = %v, want %v", tt.code, err, tt.want)
		}
	}
	invalid := newClient(t, http.StatusBadRequest, `{"code":"invalid","message":"組織の上流の IdP の設定がありません"}`, &calls, &form)
	if _, err := invalid.Register(ctx, "org-x", "a@example.com"); !errors.Is(err, apperr.ErrInvalidInput) ||
		err.Error() != "ID ブローカーが受け付けません: 組織の上流の IdP の設定がありません" {
		t.Errorf("400 の Register の err = %v, want 本文の文の ErrInvalidInput", err)
	}
	notPending := newClient(t, http.StatusConflict, `{"code":"not_pending"}`, &calls, &form)
	if err := notPending.Unregister(ctx, "01JBRKR0000000000000000000"); err != nil {
		t.Errorf("409 の Unregister の err = %v, want 有効な職員は消さずに成功", err)
	}
	notFound := newClient(t, http.StatusNotFound, `{"code":"not_found"}`, &calls, &form)
	if err := notFound.Suspend(ctx, "01JBRKR0000000000000000000"); !errors.Is(err, apperr.ErrNotFound) {
		t.Errorf("404 の Suspend の err = %v, want ErrNotFound", err)
	}
	if err := notFound.Unregister(ctx, "01JBRKR0000000000000000000"); err != nil {
		t.Errorf("404 の Unregister の err = %v, want 消えているので成功", err)
	}
	revoke := newClient(t, http.StatusBadGateway, `{"code":"revoke_failed"}`, &calls, &form)
	if err := revoke.Suspend(ctx, "01JBRKR0000000000000000000"); !errors.Is(err, staff.ErrRevokeFailed) {
		t.Errorf("revoke_failed の 502 の Suspend の err = %v, want ErrRevokeFailed", err)
	}
	retired := newClient(t, http.StatusConflict, `{"code":"retired"}`, &calls, &form)
	if err := retired.Suspend(ctx, "01JBRKR0000000000000000000"); !errors.Is(err, staff.ErrIdentityRetired) {
		t.Errorf("409 retired の Suspend の err = %v, want ErrIdentityRetired", err)
	}
	if err := retired.Resume(ctx, "01JBRKR0000000000000000000"); !errors.Is(err, staff.ErrIdentityRetired) {
		t.Errorf("409 retired の Resume の err = %v, want ErrIdentityRetired", err)
	}
	if err := revoke.Retire(ctx, "01JBRKR0000000000000000000"); !errors.Is(err, staff.ErrRevokeFailed) {
		t.Errorf("revoke_failed の 502 の Retire の err = %v, want ErrRevokeFailed", err)
	}
	down := newClient(t, http.StatusBadGateway, `bad gateway`, &calls, &form)
	if err := down.Suspend(ctx, "01JBRKR0000000000000000000"); err == nil || errors.Is(err, apperr.ErrNotFound) || errors.Is(err, staff.ErrRevokeFailed) {
		t.Errorf("502 の Suspend の err = %v, want そのほかのエラー", err)
	}
}

func TestStaffCalls(t *testing.T) {
	ctx := context.Background()
	var calls []call
	var form string
	c := newClient(t, http.StatusNoContent, "", &calls, &form)
	if err := c.Suspend(ctx, "01JBRKR0000000000000000000"); err != nil {
		t.Fatal(err)
	}
	if err := c.Activate(ctx, "01JBRKR0000000000000000000"); err != nil {
		t.Fatal(err)
	}
	if err := c.Unregister(ctx, "01JBRKR0000000000000000000"); err != nil {
		t.Fatal(err)
	}
	if err := c.Resume(ctx, "01JBRKR0000000000000000000"); err != nil {
		t.Fatal(err)
	}
	if err := c.Retire(ctx, "01JBRKR0000000000000000000"); err != nil {
		t.Fatal(err)
	}
	want := []call{
		{http.MethodPost, "/internal/staff/01JBRKR0000000000000000000/suspend", "Bearer client-token", ""},
		{http.MethodPost, "/internal/staff/01JBRKR0000000000000000000/activate", "Bearer client-token", ""},
		{http.MethodDelete, "/internal/staff/01JBRKR0000000000000000000", "Bearer client-token", ""},
		{http.MethodPost, "/internal/staff/01JBRKR0000000000000000000/resume", "Bearer client-token", ""},
		{http.MethodPost, "/internal/staff/01JBRKR0000000000000000000/retire", "Bearer client-token", ""},
	}
	for i, w := range want {
		if calls[i] != w {
			t.Errorf("calls[%d] = %+v, want %+v", i, calls[i], w)
		}
	}
}

// トークンの発行が失敗したときは、本文に secret を入れて取り直さず、最初の失敗の理由を返す。
func TestTokenFailureIsNotRetriedWithPostedSecret(t *testing.T) {
	var tokenCalls int
	hydra := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		tokenCalls++
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = io.WriteString(w, `{"error":"server_error","error_description":"token hook failed"}`)
	}))
	t.Cleanup(hydra.Close)
	c := broker.New(broker.Config{
		URL: "http://broker.invalid", TokenURL: hydra.URL + "/oauth2/token",
		ClientID: "schedule", ClientSecret: "schedule-secret", Audience: "broker",
	}, nil)
	_, err := c.Register(context.Background(), "org-a", "a@example.com")
	if err == nil || !strings.Contains(err.Error(), "token hook failed") {
		t.Errorf("err = %v, want トークンの発行の最初の失敗の理由", err)
	}
	if tokenCalls != 1 {
		t.Errorf("トークンの要求の数 = %d, want 1", tokenCalls)
	}
}
