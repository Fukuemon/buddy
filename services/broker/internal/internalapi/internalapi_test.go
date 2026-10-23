package internalapi_test

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/Fukuemon/buddy/packages/go/oidc"

	"github.com/Fukuemon/buddy/services/broker/internal/internalapi"
	"github.com/Fukuemon/buddy/services/broker/internal/login"
)

const (
	staffA     = "01JAAAAAAAAAAAAAAAAAAAAAAA"
	newID      = "01JNNNNNNNNNNNNNNNNNNNNNNN"
	validToken = "valid-token"
	hookKey    = "hook-key"
)

// fakeStore は、職員を ID で持つ internalapi.Store である。
type fakeStore struct {
	staff  map[string]login.StaffMember
	linked map[string]bool
	err    error
}

func (s *fakeStore) Get(_ context.Context, id string) (login.StaffMember, error) {
	if s.err != nil {
		return login.StaffMember{}, s.err
	}
	m, ok := s.staff[id]
	if !ok {
		return login.StaffMember{}, login.ErrNotFound
	}
	return m, nil
}

func (s *fakeStore) Register(_ context.Context, m login.StaffMember) (login.StaffMember, bool, error) {
	if s.err != nil {
		return login.StaffMember{}, false, s.err
	}
	for _, cur := range s.staff {
		if cur.OrgID == m.OrgID && cur.Email == m.Email {
			return cur, false, nil
		}
	}
	s.staff[m.ID] = m
	return m, true, nil
}

func (s *fakeStore) Delete(_ context.Context, id string) error {
	if _, ok := s.staff[id]; !ok {
		return login.ErrNotFound
	}
	if s.linked[id] {
		return internalapi.ErrLinked
	}
	delete(s.staff, id)
	return nil
}

func (s *fakeStore) Suspend(_ context.Context, id string) error {
	m, ok := s.staff[id]
	if !ok {
		return login.ErrNotFound
	}
	m.Status = login.StatusSuspended
	s.staff[id] = m
	return nil
}

// fakeHydra は、取り消した職員の ID を残す internalapi.Hydra である。
type fakeHydra struct {
	login, consent []string
	err            error
}

func (h *fakeHydra) RevokeLoginSessions(_ context.Context, subject string) error {
	h.login = append(h.login, subject)
	return h.err
}

func (h *fakeHydra) RevokeConsentSessions(_ context.Context, subject string) error {
	h.consent = append(h.consent, subject)
	return h.err
}

// fakeVerifier は、validToken だけを予定の API のクライアントのトークンとして受ける。
type fakeVerifier struct{}

func (fakeVerifier) Verify(_ context.Context, raw string) (oidc.Identity, error) {
	if raw != validToken {
		return oidc.Identity{}, errors.New("invalid")
	}
	return oidc.Identity{Subject: "schedule"}, nil
}

var now = time.Date(2026, 10, 23, 12, 0, 0, 0, time.UTC)

func newHandler(store *fakeStore, h *fakeHydra) http.Handler {
	return internalapi.NewHandler(internalapi.Config{
		Logger:       slog.New(slog.DiscardHandler),
		Staff:        store,
		Hydra:        h,
		Verifier:     fakeVerifier{},
		KnownOrg:     func(orgID string) bool { return orgID == "org-a" },
		NewID:        func() string { return newID },
		TokenHookKey: hookKey,
		Now:          func() time.Time { return now },
	})
}

func newStore(members ...login.StaffMember) *fakeStore {
	s := &fakeStore{staff: map[string]login.StaffMember{}, linked: map[string]bool{}}
	for _, m := range members {
		s.staff[m.ID] = m
	}
	return s
}

func serve(h http.Handler, method, path, token, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

// 検証の観点 5: client credentials のトークンなしで内部の API を呼ぶと 401 になる。
func TestStaffRoutesRequireClientToken(t *testing.T) {
	routes := []struct{ method, path string }{
		{http.MethodPost, "/internal/staff"},
		{http.MethodDelete, "/internal/staff/" + staffA},
		{http.MethodPost, "/internal/staff/" + staffA + "/suspend"},
	}
	for _, r := range routes {
		for _, token := range []string{"", "forged"} {
			store := newStore(login.StaffMember{ID: staffA, OrgID: "org-a", Email: "a@example.com", Status: login.StatusActive})
			hy := &fakeHydra{}
			rec := serve(newHandler(store, hy), r.method, r.path, token, `{"org_id":"org-a","email":"new@example.com"}`)
			if rec.Code != http.StatusUnauthorized || rec.Header().Get("WWW-Authenticate") == "" {
				t.Errorf("%s %s（トークン %q）= %d, want 401 と WWW-Authenticate", r.method, r.path, token, rec.Code)
			}
			if len(store.staff) != 1 || store.staff[staffA].Status != login.StatusActive || len(hy.login) != 0 {
				t.Errorf("%s %s（トークン %q）が職員を変えた: %+v", r.method, r.path, token, store.staff)
			}
		}
	}
}

func TestRegister(t *testing.T) {
	existing := login.StaffMember{ID: staffA, OrgID: "org-a", Email: "aoki@example.com", Status: login.StatusActive}
	suspended := existing
	suspended.Status = login.StatusSuspended
	tests := []struct {
		name   string
		store  *fakeStore
		body   string
		code   int
		wantID string
	}{
		{"新しいメールは発行した ID で作る", newStore(existing), `{"org_id":"org-a","email":" New@Example.com "}`, http.StatusCreated, newID},
		{"同じ事業所の同じメールは、作らずにその職員を返す", newStore(existing), `{"org_id":"org-a","email":"AOKI@example.com"}`, http.StatusOK, staffA},
		{"同じメールの職員が止められていれば 409", newStore(suspended), `{"org_id":"org-a","email":"aoki@example.com"}`, http.StatusConflict, ""},
		{"上流の IdP の設定に無い組織は 400", newStore(), `{"org_id":"org-x","email":"new@example.com"}`, http.StatusBadRequest, ""},
		{"メールの形でなければ 400", newStore(), `{"org_id":"org-a","email":"new"}`, http.StatusBadRequest, ""},
		{"本文が JSON でなければ 400", newStore(), `{`, http.StatusBadRequest, ""},
		{"DB に書けなければ 500", &fakeStore{err: errors.New("down")}, `{"org_id":"org-a","email":"new@example.com"}`, http.StatusInternalServerError, ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := serve(newHandler(tt.store, &fakeHydra{}), http.MethodPost, "/internal/staff", validToken, tt.body)
			if rec.Code != tt.code {
				t.Fatalf("code = %d %s, want %d", rec.Code, rec.Body, tt.code)
			}
			if tt.wantID == "" {
				return
			}
			var got struct{ ID, Email, Status string }
			if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
				t.Fatal(err)
			}
			if got.ID != tt.wantID || got.Status != login.StatusActive || got.Email != strings.ToLower(got.Email) {
				t.Errorf("body = %+v, want ID %s", got, tt.wantID)
			}
			if m := tt.store.staff[got.ID]; m.Email != "aoki@example.com" && m.Email != "new@example.com" {
				t.Errorf("書いたメール = %q, want 小文字にそろえた値", m.Email)
			}
		})
	}
}

func TestDelete(t *testing.T) {
	m := login.StaffMember{ID: staffA, OrgID: "org-a", Email: "a@example.com", Status: login.StatusActive}
	store := newStore(m)
	h := newHandler(store, &fakeHydra{})
	if rec := serve(h, http.MethodDelete, "/internal/staff/"+staffA, validToken, ""); rec.Code != http.StatusNoContent || len(store.staff) != 0 {
		t.Fatalf("code = %d, staff = %+v, want 204 で消える", rec.Code, store.staff)
	}
	if rec := serve(h, http.MethodDelete, "/internal/staff/"+staffA, validToken, ""); rec.Code != http.StatusNotFound {
		t.Errorf("いない職員の code = %d, want 404", rec.Code)
	}
	linked := newStore(m)
	linked.linked[staffA] = true
	if rec := serve(newHandler(linked, &fakeHydra{}), http.MethodDelete, "/internal/staff/"+staffA, validToken, ""); rec.Code != http.StatusConflict || len(linked.staff) != 1 {
		t.Errorf("上流のアカウントを結び付けた職員の code = %d, want 409 で残る", rec.Code)
	}
}

func TestSuspend(t *testing.T) {
	m := login.StaffMember{ID: staffA, OrgID: "org-a", Email: "a@example.com", Status: login.StatusActive}
	t.Run("止めて Hydra のセッションと同意を取り消す", func(t *testing.T) {
		store, hy := newStore(m), &fakeHydra{}
		rec := serve(newHandler(store, hy), http.MethodPost, "/internal/staff/"+staffA+"/suspend", validToken, "")
		if rec.Code != http.StatusNoContent || store.staff[staffA].Status != login.StatusSuspended {
			t.Fatalf("code = %d, status = %s, want 204 と suspended", rec.Code, store.staff[staffA].Status)
		}
		if len(hy.login) != 1 || hy.login[0] != staffA || len(hy.consent) != 1 || hy.consent[0] != staffA {
			t.Errorf("取り消し = login %v, consent %v, want 職員の ID で 1 回ずつ", hy.login, hy.consent)
		}
	})
	t.Run("取り消しに失敗すれば 502 で、職員は止めたまま", func(t *testing.T) {
		store, hy := newStore(m), &fakeHydra{err: errors.New("down")}
		rec := serve(newHandler(store, hy), http.MethodPost, "/internal/staff/"+staffA+"/suspend", validToken, "")
		if rec.Code != http.StatusBadGateway || store.staff[staffA].Status != login.StatusSuspended {
			t.Errorf("code = %d, status = %s, want 502 と suspended", rec.Code, store.staff[staffA].Status)
		}
	})
	t.Run("いない職員は 404", func(t *testing.T) {
		hy := &fakeHydra{}
		rec := serve(newHandler(newStore(), hy), http.MethodPost, "/internal/staff/"+staffA+"/suspend", validToken, "")
		if rec.Code != http.StatusNotFound || len(hy.login) != 0 {
			t.Errorf("code = %d, 取り消し = %v, want 404 で取り消さない", rec.Code, hy.login)
		}
	})
}

// hookBody は、Hydra v26 が token_hook に送る本文の形で、ブローカーが読む値を入れる。
func hookBody(grantType, subject string, authTime time.Time) string {
	b, _ := json.Marshal(map[string]any{
		"session": map[string]any{
			"id_token": map[string]any{
				"subject":         subject,
				"id_token_claims": map[string]any{"sub": subject, "auth_time": authTime},
			},
			"extra": map[string]any{"org_id": "org-a"},
		},
		"request": map[string]any{"client_id": "web", "grant_types": []string{grantType}, "payload": map[string]any{}},
	})
	return string(b)
}

func TestTokenHook(t *testing.T) {
	active := login.StaffMember{ID: staffA, OrgID: "org-a", Email: "a@example.com", Status: login.StatusActive}
	suspended := active
	suspended.Status = login.StatusSuspended
	tests := []struct {
		name  string
		store *fakeStore
		key   string
		body  string
		code  int
	}{
		{"有効な職員の refresh は 204", newStore(active), hookKey, hookBody("refresh_token", staffA, now.Add(-11*time.Hour)), http.StatusNoContent},
		{"有効な職員の認可コードは 204", newStore(active), hookKey, hookBody("authorization_code", staffA, now.Add(-time.Minute)), http.StatusNoContent},
		{"止めた職員は 403", newStore(suspended), hookKey, hookBody("refresh_token", staffA, now.Add(-time.Minute)), http.StatusForbidden},
		{"いない職員は 403", newStore(), hookKey, hookBody("refresh_token", staffA, now.Add(-time.Minute)), http.StatusForbidden},
		{"上流のログインから 12 時間を過ぎた refresh は 403", newStore(active), hookKey, hookBody("refresh_token", staffA, now.Add(-12*time.Hour-time.Second)), http.StatusForbidden},
		{"ログインの時刻が無ければ 403", newStore(active), hookKey, hookBody("refresh_token", staffA, time.Time{}), http.StatusForbidden},
		{"職員の ID が無ければ 403", newStore(active), hookKey, hookBody("refresh_token", "", now), http.StatusForbidden},
		{"client credentials は職員を見ずに 204", newStore(), hookKey, hookBody("client_credentials", "", time.Time{}), http.StatusNoContent},
		{"鍵が違えば 401", newStore(active), "wrong", hookBody("refresh_token", staffA, now), http.StatusUnauthorized},
		{"鍵が無ければ 401", newStore(active), "", hookBody("refresh_token", staffA, now), http.StatusUnauthorized},
		{"職員を引けなければ 500", &fakeStore{err: errors.New("down")}, hookKey, hookBody("refresh_token", staffA, now), http.StatusInternalServerError},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPost, "/internal/token-hook", strings.NewReader(tt.body))
			if tt.key != "" {
				req.Header.Set(internalapi.TokenHookKeyHeader, tt.key)
			}
			rec := httptest.NewRecorder()
			newHandler(tt.store, &fakeHydra{}).ServeHTTP(rec, req)
			if rec.Code != tt.code {
				t.Errorf("code = %d, want %d", rec.Code, tt.code)
			}
		})
	}
}
