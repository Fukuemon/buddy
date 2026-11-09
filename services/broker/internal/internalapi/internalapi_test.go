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
	"github.com/Fukuemon/buddy/services/broker/internal/staff"
)

const (
	staffA     = "01JAAAAAAAAAAAAAAAAAAAAAAA"
	newID      = "01JNNNNNNNNNNNNNNNNNNNNNNN"
	validToken = "valid-token"
	// otherToken は、許していないクライアントの client credentials のトークンである。
	otherToken = "other-client-token"
	// staffToken は、aud に broker を持つ職員のトークンで、組織の ID を持つ。
	staffToken = "staff-token"
	hookKey    = "hook-key"
)

// fakeStore は、職員を ID で持つ internalapi.Store である。
type fakeStore struct {
	staff map[string]staff.Member
	err   error
}

func (s *fakeStore) Get(_ context.Context, id string) (staff.Member, error) {
	if s.err != nil {
		return staff.Member{}, s.err
	}
	m, ok := s.staff[id]
	if !ok {
		return staff.Member{}, staff.ErrNotFound
	}
	return m, nil
}

func (s *fakeStore) Register(_ context.Context, m staff.Member) (staff.Member, bool, error) {
	if s.err != nil {
		return staff.Member{}, false, s.err
	}
	for _, cur := range s.staff {
		if cur.Email != m.Email {
			continue
		}
		if cur.OrgID != m.OrgID {
			return staff.Member{}, false, staff.ErrEmailTaken
		}
		if cur.Status == staff.StatusSuspended {
			return staff.Member{}, false, staff.ErrSuspended
		}
		return cur, false, nil
	}
	s.staff[m.ID] = m
	return m, true, nil
}

func (s *fakeStore) Activate(_ context.Context, id string) error {
	m, ok := s.staff[id]
	switch {
	case !ok:
		return staff.ErrNotFound
	case m.Status == staff.StatusSuspended:
		return staff.ErrSuspended
	case m.Status == staff.StatusRetired:
		return staff.ErrRetired
	}
	m.Status = staff.StatusActive
	s.staff[id] = m
	return nil
}

func (s *fakeStore) Delete(_ context.Context, id string) error {
	m, ok := s.staff[id]
	if !ok {
		return staff.ErrNotFound
	}
	if m.Status != staff.StatusPending {
		return staff.ErrNotPending
	}
	delete(s.staff, id)
	return nil
}

func (s *fakeStore) Suspend(_ context.Context, id string) error {
	m, ok := s.staff[id]
	switch {
	case !ok:
		return staff.ErrNotFound
	case m.Status == staff.StatusRetired:
		return staff.ErrRetired
	}
	m.Status = staff.StatusSuspended
	s.staff[id] = m
	return nil
}

func (s *fakeStore) Resume(_ context.Context, id string) error {
	m, ok := s.staff[id]
	switch {
	case !ok:
		return staff.ErrNotFound
	case m.Status == staff.StatusRetired:
		return staff.ErrRetired
	case m.Status == staff.StatusPending:
		return staff.ErrNotSuspended
	}
	m.Status = staff.StatusActive
	s.staff[id] = m
	return nil
}

func (s *fakeStore) Retire(_ context.Context, id string) error {
	m, ok := s.staff[id]
	if !ok {
		return staff.ErrNotFound
	}
	m.Status, m.Email, m.Upstream = staff.StatusRetired, "", staff.UpstreamAccount{}
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

// fakeVerifier は、validToken を予定の API のクライアントの、otherToken をほかのクライアントの、
// staffToken を職員のトークンとして受ける。
type fakeVerifier struct{}

func (fakeVerifier) Verify(_ context.Context, raw string) (oidc.Identity, error) {
	switch raw {
	case validToken:
		return oidc.Identity{Subject: "schedule"}, nil
	case otherToken:
		return oidc.Identity{Subject: "receipt"}, nil
	case staffToken:
		return oidc.Identity{Subject: staffA, OrgID: "org-a"}, nil
	}
	return oidc.Identity{}, errors.New("invalid")
}

var now = time.Date(2026, 10, 23, 12, 0, 0, 0, time.UTC)

func newHandler(store *fakeStore, h *fakeHydra) http.Handler {
	return internalapi.NewHandler(internalapi.Config{
		Logger:       slog.New(slog.DiscardHandler),
		Staff:        store,
		Hydra:        h,
		Verifier:     fakeVerifier{},
		Clients:      []string{"schedule"},
		KnownOrg:     func(orgID string) bool { return orgID == "org-a" },
		NewID:        func() string { return newID },
		TokenHookKey: hookKey,
		Now:          func() time.Time { return now },
	})
}

func newStore(members ...staff.Member) *fakeStore {
	s := &fakeStore{staff: map[string]staff.Member{}}
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

var staffRoutes = []struct{ method, path string }{
	{http.MethodPost, "/internal/staff"},
	{http.MethodPost, "/internal/staff/" + staffA + "/activate"},
	{http.MethodDelete, "/internal/staff/" + staffA},
	{http.MethodPost, "/internal/staff/" + staffA + "/suspend"},
	{http.MethodPost, "/internal/staff/" + staffA + "/resume"},
	{http.MethodPost, "/internal/staff/" + staffA + "/retire"},
}

// 検証の観点 5: client credentials のトークンなしで内部の API を呼ぶと 401 になる。
func TestStaffRoutesRequireClientToken(t *testing.T) {
	for _, r := range staffRoutes {
		for _, token := range []string{"", "forged"} {
			store := newStore(staff.Member{ID: staffA, OrgID: "org-a", Email: "a@example.com", Status: staff.StatusPending})
			hy := &fakeHydra{}
			rec := serve(newHandler(store, hy), r.method, r.path, token, `{"org_id":"org-a","email":"new@example.com"}`)
			if rec.Code != http.StatusUnauthorized || rec.Header().Get("WWW-Authenticate") == "" {
				t.Errorf("%s %s（トークン %q）= %d, want 401 と WWW-Authenticate", r.method, r.path, token, rec.Code)
			}
			if len(store.staff) != 1 || store.staff[staffA].Status != staff.StatusPending || len(hy.login) != 0 {
				t.Errorf("%s %s（トークン %q）が職員を変えた: %+v", r.method, r.path, token, store.staff)
			}
		}
	}
}

// 許していないクライアントのトークンと、組織の ID を持つ職員のトークンは、検証できても 403 になる。
func TestStaffRoutesRejectOtherClients(t *testing.T) {
	for _, r := range staffRoutes {
		for _, token := range []string{otherToken, staffToken} {
			store := newStore(staff.Member{ID: staffA, OrgID: "org-a", Email: "a@example.com", Status: staff.StatusPending})
			hy := &fakeHydra{}
			rec := serve(newHandler(store, hy), r.method, r.path, token, `{"org_id":"org-a","email":"new@example.com"}`)
			if rec.Code != http.StatusForbidden {
				t.Errorf("%s %s（トークン %q）= %d, want 403", r.method, r.path, token, rec.Code)
			}
			if len(store.staff) != 1 || store.staff[staffA].Status != staff.StatusPending || len(hy.login) != 0 {
				t.Errorf("%s %s（トークン %q）が職員を変えた: %+v", r.method, r.path, token, store.staff)
			}
		}
	}
}

func TestRegister(t *testing.T) {
	existing := staff.Member{ID: staffA, OrgID: "org-a", Email: "aoki@example.com", Status: staff.StatusActive}
	pending := existing
	pending.Status = staff.StatusPending
	suspended := existing
	suspended.Status = staff.StatusSuspended
	otherOrg := existing
	otherOrg.OrgID = "org-b"
	tests := []struct {
		name       string
		store      *fakeStore
		body       string
		code       int
		wantID     string
		wantStatus string
		wantCode   string
	}{
		{"新しいメールは発行した ID の登録の途中の職員で作る", newStore(existing), `{"org_id":"org-a","email":" New@Example.com "}`, http.StatusCreated, newID, staff.StatusPending, ""},
		{"同じ事業所の同じメールは、作らずにその職員を返す", newStore(existing), `{"org_id":"org-a","email":"AOKI@example.com"}`, http.StatusOK, staffA, staff.StatusActive, ""},
		{"同じ事業所の登録の途中の職員は、そのまま返す", newStore(pending), `{"org_id":"org-a","email":"aoki@example.com"}`, http.StatusOK, staffA, staff.StatusPending, ""},
		{"同じメールの職員が止められていれば 409", newStore(suspended), `{"org_id":"org-a","email":"aoki@example.com"}`, http.StatusConflict, "", "", "suspended"},
		{"ほかの事業所に同じメールの職員がいれば 409", newStore(otherOrg), `{"org_id":"org-a","email":"aoki@example.com"}`, http.StatusConflict, "", "", "email_taken"},
		{"上流の IdP の設定に無い組織は 400", newStore(), `{"org_id":"org-x","email":"new@example.com"}`, http.StatusBadRequest, "", "", "invalid"},
		{"メールの形でなければ 400", newStore(), `{"org_id":"org-a","email":"new"}`, http.StatusBadRequest, "", "", "invalid"},
		{"本文が JSON でなければ 400", newStore(), `{`, http.StatusBadRequest, "", "", "invalid"},
		{"DB に書けなければ 500", &fakeStore{err: errors.New("down")}, `{"org_id":"org-a","email":"new@example.com"}`, http.StatusInternalServerError, "", "", "internal"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := serve(newHandler(tt.store, &fakeHydra{}), http.MethodPost, "/internal/staff", validToken, tt.body)
			if rec.Code != tt.code {
				t.Fatalf("code = %d %s, want %d", rec.Code, rec.Body, tt.code)
			}
			if tt.wantID == "" {
				var got struct{ Code string }
				if err := json.NewDecoder(rec.Body).Decode(&got); err != nil || got.Code != tt.wantCode {
					t.Errorf("本文の code = %q, %v, want %q", got.Code, err, tt.wantCode)
				}
				return
			}
			var got struct{ ID, Email, Status string }
			if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
				t.Fatal(err)
			}
			if got.ID != tt.wantID || got.Status != tt.wantStatus || got.Email != strings.ToLower(got.Email) {
				t.Errorf("body = %+v, want ID %s、状態 %s", got, tt.wantID, tt.wantStatus)
			}
			if m := tt.store.staff[got.ID]; m.Email != "aoki@example.com" && m.Email != "new@example.com" {
				t.Errorf("書いたメール = %q, want 小文字にそろえた値", m.Email)
			}
		})
	}
}

func TestActivate(t *testing.T) {
	m := staff.Member{ID: staffA, OrgID: "org-a", Email: "a@example.com", Status: staff.StatusPending}
	store := newStore(m)
	h := newHandler(store, &fakeHydra{})
	for range 2 {
		if rec := serve(h, http.MethodPost, "/internal/staff/"+staffA+"/activate", validToken, ""); rec.Code != http.StatusNoContent || store.staff[staffA].Status != staff.StatusActive {
			t.Fatalf("code = %d, status = %s, want 204 と active", rec.Code, store.staff[staffA].Status)
		}
	}
	m.Status = staff.StatusSuspended
	suspended := newStore(m)
	if rec := serve(newHandler(suspended, &fakeHydra{}), http.MethodPost, "/internal/staff/"+staffA+"/activate", validToken, ""); rec.Code != http.StatusConflict || suspended.staff[staffA].Status != staff.StatusSuspended {
		t.Errorf("止めた職員の code = %d, want 409 で止めたまま", rec.Code)
	}
	if rec := serve(newHandler(newStore(), &fakeHydra{}), http.MethodPost, "/internal/staff/"+staffA+"/activate", validToken, ""); rec.Code != http.StatusNotFound {
		t.Errorf("いない職員の code = %d, want 404", rec.Code)
	}
}

func TestDelete(t *testing.T) {
	m := staff.Member{ID: staffA, OrgID: "org-a", Email: "a@example.com", Status: staff.StatusPending}
	store := newStore(m)
	h := newHandler(store, &fakeHydra{})
	if rec := serve(h, http.MethodDelete, "/internal/staff/"+staffA, validToken, ""); rec.Code != http.StatusNoContent || len(store.staff) != 0 {
		t.Fatalf("code = %d, staff = %+v, want 204 で消える", rec.Code, store.staff)
	}
	if rec := serve(h, http.MethodDelete, "/internal/staff/"+staffA, validToken, ""); rec.Code != http.StatusNotFound {
		t.Errorf("いない職員の code = %d, want 404", rec.Code)
	}
	m.Status = staff.StatusActive
	active := newStore(m)
	if rec := serve(newHandler(active, &fakeHydra{}), http.MethodDelete, "/internal/staff/"+staffA, validToken, ""); rec.Code != http.StatusConflict || len(active.staff) != 1 {
		t.Errorf("有効な職員の code = %d, want 409 で残る", rec.Code)
	}
}

func TestSuspend(t *testing.T) {
	m := staff.Member{ID: staffA, OrgID: "org-a", Email: "a@example.com", Status: staff.StatusActive}
	t.Run("止めて Hydra のセッションと同意を取り消す", func(t *testing.T) {
		store, hy := newStore(m), &fakeHydra{}
		rec := serve(newHandler(store, hy), http.MethodPost, "/internal/staff/"+staffA+"/suspend", validToken, "")
		if rec.Code != http.StatusNoContent || store.staff[staffA].Status != staff.StatusSuspended {
			t.Fatalf("code = %d, status = %s, want 204 と suspended", rec.Code, store.staff[staffA].Status)
		}
		if len(hy.login) != 1 || hy.login[0] != staffA || len(hy.consent) != 1 || hy.consent[0] != staffA {
			t.Errorf("取り消し = login %v, consent %v, want 職員の ID で 1 回ずつ", hy.login, hy.consent)
		}
	})
	t.Run("取り消しに失敗すれば 502 で、職員は止めたまま", func(t *testing.T) {
		store, hy := newStore(m), &fakeHydra{err: errors.New("down")}
		rec := serve(newHandler(store, hy), http.MethodPost, "/internal/staff/"+staffA+"/suspend", validToken, "")
		if rec.Code != http.StatusBadGateway || store.staff[staffA].Status != staff.StatusSuspended {
			t.Errorf("code = %d, status = %s, want 502 と suspended", rec.Code, store.staff[staffA].Status)
		}
		var got struct{ Code string }
		if err := json.NewDecoder(rec.Body).Decode(&got); err != nil || got.Code != "revoke_failed" {
			t.Errorf("本文の code = %q, %v, want revoke_failed", got.Code, err)
		}
	})
	t.Run("いない職員は 404", func(t *testing.T) {
		hy := &fakeHydra{}
		rec := serve(newHandler(newStore(), hy), http.MethodPost, "/internal/staff/"+staffA+"/suspend", validToken, "")
		if rec.Code != http.StatusNotFound || len(hy.login) != 0 {
			t.Errorf("code = %d, 取り消し = %v, want 404 で取り消さない", rec.Code, hy.login)
		}
	})
	t.Run("退職した職員は 409 で、止めた状態に戻さない", func(t *testing.T) {
		retired := m
		retired.Status, retired.Email = staff.StatusRetired, ""
		store, hy := newStore(retired), &fakeHydra{}
		rec := serve(newHandler(store, hy), http.MethodPost, "/internal/staff/"+staffA+"/suspend", validToken, "")
		if rec.Code != http.StatusConflict || store.staff[staffA].Status != staff.StatusRetired || len(hy.login) != 0 {
			t.Errorf("code = %d, status = %s, want 409 で retired のまま", rec.Code, store.staff[staffA].Status)
		}
		if code := errorCode(t, rec); code != "retired" {
			t.Errorf("本文の code = %q, want retired", code)
		}
	})
}

// 休職の職員を復職にしたとき、同じ上流のアカウントでログインできる（#268 の検証の観点 2）。
func TestResume(t *testing.T) {
	linked := staff.UpstreamAccount{Issuer: "https://idp.example.com", Subject: "upstream-a"}
	suspended := staff.Member{ID: staffA, OrgID: "org-a", Email: "a@example.com", Status: staff.StatusSuspended, Upstream: linked}
	t.Run("止めた職員を有効に戻し、上流のアカウントを残す", func(t *testing.T) {
		store := newStore(suspended)
		rec := serve(newHandler(store, &fakeHydra{}), http.MethodPost, "/internal/staff/"+staffA+"/resume", validToken, "")
		if got := store.staff[staffA]; rec.Code != http.StatusNoContent || got.Status != staff.StatusActive || got.Upstream != linked {
			t.Errorf("code = %d, 職員 = %+v, want 204 で active と同じ上流のアカウント", rec.Code, got)
		}
	})
	t.Run("有効な職員を戻しても 204", func(t *testing.T) {
		active := suspended
		active.Status = staff.StatusActive
		if rec := serve(newHandler(newStore(active), &fakeHydra{}), http.MethodPost, "/internal/staff/"+staffA+"/resume", validToken, ""); rec.Code != http.StatusNoContent {
			t.Errorf("code = %d, want 204", rec.Code)
		}
	})
	for _, tc := range []struct {
		name   string
		status string
		code   int
		kind   string
	}{
		{"退職した職員は 409", staff.StatusRetired, http.StatusConflict, "retired"},
		{"登録の途中の職員は 409", staff.StatusPending, http.StatusConflict, "not_suspended"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			m := suspended
			m.Status = tc.status
			store := newStore(m)
			rec := serve(newHandler(store, &fakeHydra{}), http.MethodPost, "/internal/staff/"+staffA+"/resume", validToken, "")
			if rec.Code != tc.code || store.staff[staffA].Status != tc.status {
				t.Errorf("code = %d, status = %s, want %d で変えない", rec.Code, store.staff[staffA].Status, tc.code)
			}
			if code := errorCode(t, rec); code != tc.kind {
				t.Errorf("本文の code = %q, want %s", code, tc.kind)
			}
		})
	}
	t.Run("いない職員は 404", func(t *testing.T) {
		if rec := serve(newHandler(newStore(), &fakeHydra{}), http.MethodPost, "/internal/staff/"+staffA+"/resume", validToken, ""); rec.Code != http.StatusNotFound {
			t.Errorf("code = %d, want 404", rec.Code)
		}
	})
}

// 退職では、メールと上流のアカウントを消し、Hydra のセッションと同意を取り消す（#268 の検証の観点 4）。
// 同じメールで新しい職員を登録できる（#268 の検証の観点 5）。
func TestRetire(t *testing.T) {
	m := staff.Member{ID: staffA, OrgID: "org-a", Email: "aoki@example.com", Status: staff.StatusSuspended,
		Upstream: staff.UpstreamAccount{Issuer: "https://idp.example.com", Subject: "upstream-a"}}
	t.Run("退職にしてメールと上流のアカウントを消し、取り消す", func(t *testing.T) {
		store, hy := newStore(m), &fakeHydra{}
		rec := serve(newHandler(store, hy), http.MethodPost, "/internal/staff/"+staffA+"/retire", validToken, "")
		got := store.staff[staffA]
		if rec.Code != http.StatusNoContent || got.Status != staff.StatusRetired || got.Email != "" || got.Upstream != (staff.UpstreamAccount{}) {
			t.Fatalf("code = %d, 職員 = %+v, want 204 で retired、メールと上流のアカウントが空", rec.Code, got)
		}
		if len(hy.login) != 1 || hy.login[0] != staffA || len(hy.consent) != 1 || hy.consent[0] != staffA {
			t.Errorf("取り消し = login %v, consent %v, want 職員の ID で 1 回ずつ", hy.login, hy.consent)
		}
		reg := serve(newHandler(store, hy), http.MethodPost, "/internal/staff", validToken, `{"org_id":"org-a","email":"aoki@example.com"}`)
		if reg.Code != http.StatusCreated {
			t.Errorf("同じメールの登録の code = %d, want 201", reg.Code)
		}
	})
	t.Run("退職した職員を退職にしても 204 で、取り消しをやり直す", func(t *testing.T) {
		retired := m
		retired.Status, retired.Email, retired.Upstream = staff.StatusRetired, "", staff.UpstreamAccount{}
		hy := &fakeHydra{}
		rec := serve(newHandler(newStore(retired), hy), http.MethodPost, "/internal/staff/"+staffA+"/retire", validToken, "")
		if rec.Code != http.StatusNoContent || len(hy.login) != 1 {
			t.Errorf("code = %d, 取り消し = %v, want 204 で取り消す", rec.Code, hy.login)
		}
	})
	t.Run("取り消しに失敗すれば 502 で、職員は退職のまま", func(t *testing.T) {
		store := newStore(m)
		rec := serve(newHandler(store, &fakeHydra{err: errors.New("down")}), http.MethodPost, "/internal/staff/"+staffA+"/retire", validToken, "")
		if rec.Code != http.StatusBadGateway || store.staff[staffA].Status != staff.StatusRetired {
			t.Errorf("code = %d, status = %s, want 502 と retired", rec.Code, store.staff[staffA].Status)
		}
		if code := errorCode(t, rec); code != "revoke_failed" {
			t.Errorf("本文の code = %q, want revoke_failed", code)
		}
	})
	t.Run("いない職員は 404", func(t *testing.T) {
		hy := &fakeHydra{}
		rec := serve(newHandler(newStore(), hy), http.MethodPost, "/internal/staff/"+staffA+"/retire", validToken, "")
		if rec.Code != http.StatusNotFound || len(hy.login) != 0 {
			t.Errorf("code = %d, 取り消し = %v, want 404 で取り消さない", rec.Code, hy.login)
		}
	})
}

// errorCode は、エラーの本文の code を返す。
func errorCode(t *testing.T, rec *httptest.ResponseRecorder) string {
	t.Helper()
	var got struct{ Code string }
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("本文を読めない: %v", err)
	}
	return got.Code
}

// hookBody は、Hydra v26 が token_hook に送る本文の形で、ブローカーが読む値を入れる。
func hookBody(clientID, grantType, subject string, authTime time.Time) string {
	b, _ := json.Marshal(map[string]any{
		"session": map[string]any{
			"id_token": map[string]any{
				"subject":         subject,
				"id_token_claims": map[string]any{"sub": subject, "auth_time": authTime},
			},
			"extra": map[string]any{"org_id": "org-a"},
		},
		"request": map[string]any{"client_id": clientID, "grant_types": []string{grantType}, "payload": map[string]any{}},
	})
	return string(b)
}

func TestTokenHook(t *testing.T) {
	active := staff.Member{ID: staffA, OrgID: "org-a", Email: "a@example.com", Status: staff.StatusActive}
	suspended := active
	suspended.Status = staff.StatusSuspended
	pending := active
	pending.Status = staff.StatusPending
	retired := active
	retired.Status, retired.Email = staff.StatusRetired, ""
	tests := []struct {
		name  string
		store *fakeStore
		key   string
		body  string
		code  int
	}{
		{"有効な職員の refresh は 204", newStore(active), hookKey, hookBody("web", "refresh_token", staffA, now.Add(-11*time.Hour)), http.StatusNoContent},
		{"有効な職員の認可コードは 204", newStore(active), hookKey, hookBody("web", "authorization_code", staffA, now.Add(-time.Minute)), http.StatusNoContent},
		{"止めた職員は 403", newStore(suspended), hookKey, hookBody("web", "refresh_token", staffA, now.Add(-time.Minute)), http.StatusForbidden},
		{"退職した職員は 403", newStore(retired), hookKey, hookBody("web", "refresh_token", staffA, now.Add(-time.Minute)), http.StatusForbidden},
		{"登録の途中の職員は 403", newStore(pending), hookKey, hookBody("web", "authorization_code", staffA, now.Add(-time.Minute)), http.StatusForbidden},
		{"いない職員は 403", newStore(), hookKey, hookBody("web", "refresh_token", staffA, now.Add(-time.Minute)), http.StatusForbidden},
		{"上流のログインから 12 時間を過ぎた refresh は 403", newStore(active), hookKey, hookBody("web", "refresh_token", staffA, now.Add(-12*time.Hour-time.Second)), http.StatusForbidden},
		{"ログインの時刻が無ければ 403", newStore(active), hookKey, hookBody("web", "refresh_token", staffA, time.Time{}), http.StatusForbidden},
		{"職員の ID が無ければ 403", newStore(active), hookKey, hookBody("web", "refresh_token", "", now), http.StatusForbidden},
		{"許したクライアントの client credentials は職員を見ずに 204", newStore(), hookKey, hookBody("schedule", "client_credentials", "", time.Time{}), http.StatusNoContent},
		{"許していないクライアントの client credentials は 403", newStore(), hookKey, hookBody("receipt", "client_credentials", "", time.Time{}), http.StatusForbidden},
		{"鍵が違えば 401", newStore(active), "wrong", hookBody("web", "refresh_token", staffA, now), http.StatusUnauthorized},
		{"鍵が無ければ 401", newStore(active), "", hookBody("web", "refresh_token", staffA, now), http.StatusUnauthorized},
		{"職員を引けなければ 500", &fakeStore{err: errors.New("down")}, hookKey, hookBody("web", "refresh_token", staffA, now), http.StatusInternalServerError},
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
