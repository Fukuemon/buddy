package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Fukuemon/buddy/packages/go/oidc"
	"github.com/Fukuemon/buddy/packages/go/oidc/oidctest"

	"github.com/Fukuemon/buddy/services/receipt/internal/httpapi/openapi"
	"github.com/Fukuemon/buddy/services/receipt/internal/permission"
)

const (
	orgSample       = "org-sample"
	tokenSample     = "token-sample"
	tokenNoOrg      = "token-no-org"
	tokenNoCalendar = "token-no-calendar"
	// tokenNoPermission は、照合の権限を持たない職員のトークンである。
	tokenNoPermission = "token-no-permission"
	// tokenPermissionDown は、予定の API に届かず照合の権限を確認できないトークンである。
	tokenPermissionDown = "token-permission-down"
)

// fakeVerifier は、決まったトークンだけを受ける TokenVerifier である。
type fakeVerifier struct{}

func (fakeVerifier) Verify(_ context.Context, raw string) (oidc.Identity, error) {
	switch raw {
	case tokenSample:
		return oidc.Identity{Subject: "sub-1", OrgID: orgSample}, nil
	case tokenNoOrg:
		return oidc.Identity{Subject: "sub-1"}, nil
	case tokenNoCalendar:
		return oidc.Identity{Subject: "sub-1", OrgID: "org-without-calendar"}, nil
	case tokenNoPermission, tokenPermissionDown:
		return oidc.Identity{Subject: "sub-2", OrgID: orgSample}, nil
	}
	return oidc.Identity{}, errors.New("知らないトークン")
}

// fakePermission は、tokenNoPermission と tokenPermissionDown のほかのトークンの職員に、照合を許す PermissionChecker である。
type fakePermission struct{}

func (fakePermission) RequireReceiptCheck(_ context.Context, token string) error {
	switch token {
	case tokenNoPermission:
		return permission.ErrForbidden
	case tokenPermissionDown:
		return errors.New("予定の API に届かない")
	}
	return nil
}

func TestChecksUnauthenticated(t *testing.T) {
	tests := []struct {
		name          string
		authorization string
		wantChallenge string
	}{
		{"ヘッダーがない", "", `Bearer`},
		{"スキームが違う", "Basic " + tokenSample, `Bearer`},
		{"トークンが空", "Bearer ", `Bearer`},
		{"トークンが正しくない", "Bearer forged", `Bearer error="invalid_token"`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			body, ct := multipartBody(t, validFiles(t))
			req := httptest.NewRequest(http.MethodPost, "/v1/checks", body)
			req.Header.Set("Content-Type", ct)
			if tt.authorization != "" {
				req.Header.Set("Authorization", tt.authorization)
			}
			rec := httptest.NewRecorder()
			newHandler().ServeHTTP(rec, req)
			if rec.Code != http.StatusUnauthorized {
				t.Fatalf("status %d body %s", rec.Code, rec.Body)
			}
			if got := rec.Header().Get("WWW-Authenticate"); got != tt.wantChallenge {
				t.Errorf("WWW-Authenticate = %q", got)
			}
			var e openapi.Error
			if err := json.Unmarshal(rec.Body.Bytes(), &e); err != nil || e.Code != openapi.Unauthenticated {
				t.Errorf("body = %s, %v", rec.Body, err)
			}
		})
	}
}

// notReadyVerifier は、discovery をまだ読めていない TokenVerifier である。
type notReadyVerifier struct{}

func (notReadyVerifier) Verify(context.Context, string) (oidc.Identity, error) {
	return oidc.Identity{}, oidc.ErrNotReady
}

// countingPermission は、呼ばれた回数を数える PermissionChecker である。
type countingPermission struct{ calls *int }

func (p countingPermission) RequireReceiptCheck(context.Context, string) error {
	*p.calls++
	return nil
}

// TestChecksVerifierNotReady は、discovery をまだ読めていない間、トークン付きのリクエストは権限を確認せずに 503 の auth_unavailable に、
// トークンの無いリクエストは今のとおり 401 に、/readyz は 503 に、/healthz は 200 になることを確認する。
func TestChecksVerifierNotReady(t *testing.T) {
	var calls int
	h := NewHandler(slog.New(slog.NewTextHandler(io.Discard, nil)), Config{
		MaxUploadBytes: 1 << 20, Verifier: notReadyVerifier{}, Permission: countingPermission{&calls},
		Ready: func(context.Context) error { return oidc.ErrNotReady },
	})
	body, ct := multipartBody(t, validFiles(t))
	req := httptest.NewRequest(http.MethodPost, "/v1/checks", body)
	req.Header.Set("Content-Type", ct)
	req.Header.Set("Authorization", "Bearer "+tokenSample)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("status %d body %s", rec.Code, rec.Body)
	}
	var e openapi.Error
	if err := json.Unmarshal(rec.Body.Bytes(), &e); err != nil || e.Code != openapi.AuthUnavailable {
		t.Errorf("body = %s, %v", rec.Body, err)
	}
	if got := rec.Header().Get("WWW-Authenticate"); got != "" {
		t.Errorf("WWW-Authenticate = %q", got)
	}
	if calls != 0 {
		t.Errorf("権限の確認が %d 回呼ばれた", calls)
	}

	body, ct = multipartBody(t, validFiles(t))
	req = httptest.NewRequest(http.MethodPost, "/v1/checks", body)
	req.Header.Set("Content-Type", ct)
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("トークンが無いときの status %d body %s", rec.Code, rec.Body)
	}

	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/readyz", nil))
	if rec.Code != http.StatusServiceUnavailable {
		t.Errorf("/readyz の status %d body %s", rec.Code, rec.Body)
	}
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/healthz", nil))
	if rec.Code != http.StatusOK {
		t.Errorf("/healthz の status %d body %s", rec.Code, rec.Body)
	}
}

// TestUnknownPathUnauthenticated は、定義にないパスとメソッドも、トークンが無ければ 404 より先に 401 を返すことを確認する。
func TestUnknownPathUnauthenticated(t *testing.T) {
	for _, tt := range []struct{ method, path string }{
		{http.MethodGet, "/v1/checks"},
		{http.MethodGet, "/v1/unknown"},
		{http.MethodGet, "/nowhere"},
	} {
		t.Run(tt.method+" "+tt.path, func(t *testing.T) {
			rec := httptest.NewRecorder()
			newHandler().ServeHTTP(rec, httptest.NewRequest(tt.method, tt.path, nil))
			if rec.Code != http.StatusUnauthorized {
				t.Errorf("status %d body %s", rec.Code, rec.Body)
			}
		})
	}
}

func TestChecksBearerSchemeCaseInsensitive(t *testing.T) {
	body, ct := multipartBody(t, validFiles(t))
	req := httptest.NewRequest(http.MethodPost, "/v1/checks", body)
	req.Header.Set("Content-Type", ct)
	req.Header.Set("Authorization", "bearer "+tokenSample)
	rec := httptest.NewRecorder()
	newHandler().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Errorf("status %d body %s", rec.Code, rec.Body)
	}
}

// TestChecksWithIssuer は、フェイクの Issuer が署名したトークンを、本物の oidc.Verifier で確認する。
func TestChecksWithIssuer(t *testing.T) {
	iss, err := oidctest.Start()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(iss.Close)
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	v, err := oidc.NewVerifier(t.Context(), oidc.Config{Issuer: iss.URL(), Audience: "receipt", OrgClaim: "org_id"}, iss.Client(), logger)
	if err != nil {
		t.Fatal(err)
	}
	h := NewHandler(logger, Config{MaxUploadBytes: 1 << 20, Verifier: v, Permission: fakePermission{}})
	for _, tt := range []struct {
		name     string
		audience string
		want     int
	}{
		{"aud が receipt", "receipt", http.StatusOK},
		{"aud が schedule", "schedule", http.StatusUnauthorized},
	} {
		t.Run(tt.name, func(t *testing.T) {
			raw, err := iss.Sign(iss.Claims(tt.audience, "sub-1"))
			if err != nil {
				t.Fatal(err)
			}
			body, ct := multipartBody(t, validFiles(t))
			req := httptest.NewRequest(http.MethodPost, "/v1/checks", body)
			req.Header.Set("Content-Type", ct)
			req.Header.Set("Authorization", "Bearer "+raw)
			rec := httptest.NewRecorder()
			h.ServeHTTP(rec, req)
			if rec.Code != tt.want {
				t.Errorf("status %d body %s", rec.Code, rec.Body)
			}
		})
	}
}

// TestChecksPermission は、照合の権限を持たない職員を 403 で拒み、権限を確認できないときに 502 を返すことを確認する（ADR-0007）。
func TestChecksPermission(t *testing.T) {
	tests := []struct {
		name     string
		token    string
		files    map[string][]byte
		values   map[string]string
		want     int
		wantCode openapi.ErrorCode
	}{
		{"予定の CSV で照合の権限がない", tokenNoPermission, validFiles(t), nil, http.StatusForbidden, openapi.Forbidden},
		{"対象の月で照合の権限がない", tokenNoPermission, map[string][]byte{FieldVisits: testdata(t, "visits_utf8.csv")}, map[string]string{FieldMonth: "2026-11"}, http.StatusForbidden, openapi.Forbidden},
		{"本文が誤っていても権限を先に確認する", tokenNoPermission, map[string][]byte{}, nil, http.StatusForbidden, openapi.Forbidden},
		{"予定の API に届かない", tokenPermissionDown, validFiles(t), nil, http.StatusBadGateway, openapi.PermissionCheckFailed},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := postFormAs(t, newHandler(), tt.token, tt.files, tt.values)
			if rec.Code != tt.want {
				t.Fatalf("status %d body %s", rec.Code, rec.Body)
			}
			var body openapi.Error
			if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil || body.Code != tt.wantCode {
				t.Errorf("body = %s, err = %v", rec.Body, err)
			}
		})
	}
}
