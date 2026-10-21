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

	"github.com/Fukuemon/buddy/apps/receipt-api/internal/httpapi/openapi"
)

const (
	orgSample       = "org-sample"
	tokenSample     = "token-sample"
	tokenNoOrg      = "token-no-org"
	tokenNoCalendar = "token-no-calendar"
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
	}
	return oidc.Identity{}, errors.New("知らないトークン")
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

// TestUnknownPathUnauthenticated は、定義にないパスとメソッドも、トークンが無ければ 404 より先に 401 を返すことを確かめる。
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

// TestChecksWithIssuer は、偽物の発行者が署名したトークンを、本物の oidc.Verifier で確かめる。
func TestChecksWithIssuer(t *testing.T) {
	iss, err := oidctest.Start()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(iss.Close)
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	v, err := oidc.NewVerifier(t.Context(), oidc.Config{Issuer: iss.URL(), Audience: "receipt-api", OrgClaim: "org_id"}, iss.Client(), logger)
	if err != nil {
		t.Fatal(err)
	}
	h := NewHandler(logger, Config{MaxUploadBytes: 1 << 20, Verifier: v})
	for _, tt := range []struct {
		name     string
		audience string
		want     int
	}{
		{"aud が receipt-api", "receipt-api", http.StatusOK},
		{"aud が schedule-api", "schedule-api", http.StatusUnauthorized},
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
