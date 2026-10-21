package oidc_test

import (
	"context"
	"io"
	"log/slog"
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"github.com/Fukuemon/buddy/apps/receipt-api/internal/oidc"
	"github.com/Fukuemon/buddy/apps/receipt-api/internal/oidc/oidctest"
)

const audience = "receipt-api"

func setup(t *testing.T) (*oidctest.Issuer, *oidc.Verifier) {
	t.Helper()
	iss, err := oidctest.Start()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(iss.Close)
	v, err := oidc.NewVerifier(t.Context(), oidc.Config{Issuer: iss.URL(), Audience: audience, OrgClaim: "org_id"},
		iss.Client(), slog.New(slog.NewTextHandler(io.Discard, nil)))
	if err != nil {
		t.Fatal(err)
	}
	return iss, v
}

func sign(t *testing.T, iss *oidctest.Issuer, claims jwt.MapClaims) string {
	t.Helper()
	raw, err := iss.Sign(claims)
	if err != nil {
		t.Fatal(err)
	}
	return raw
}

func TestVerify(t *testing.T) {
	iss, v := setup(t)
	claims := iss.Claims(audience, "sub-1")
	claims["org_id"] = "org-sample"
	id, err := v.Verify(context.Background(), sign(t, iss, claims))
	if err != nil {
		t.Fatal(err)
	}
	if id.Subject != "sub-1" || id.OrgID != "org-sample" {
		t.Errorf("id = %+v", id)
	}
}

func TestVerifyOrgClaimName(t *testing.T) {
	iss, err := oidctest.Start()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(iss.Close)
	v, err := oidc.NewVerifier(t.Context(), oidc.Config{Issuer: iss.URL(), Audience: audience, OrgClaim: "organization"},
		iss.Client(), slog.New(slog.NewTextHandler(io.Discard, nil)))
	if err != nil {
		t.Fatal(err)
	}
	claims := iss.Claims(audience, "sub-1")
	claims["organization"] = "org-b"
	claims["org_id"] = "org-a"
	id, err := v.Verify(context.Background(), sign(t, iss, claims))
	if err != nil || id.OrgID != "org-b" {
		t.Fatalf("id = %+v, err = %v", id, err)
	}
}

func TestVerifyRejects(t *testing.T) {
	iss, v := setup(t)
	now := time.Now()
	tests := []struct {
		name  string
		token func(t *testing.T) string
	}{
		{name: "期限切れ", token: func(t *testing.T) string {
			c := iss.Claims(audience, "sub-1")
			c["exp"] = now.Add(-time.Hour).Unix()
			return sign(t, iss, c)
		}},
		{name: "exp がない", token: func(t *testing.T) string {
			c := iss.Claims(audience, "sub-1")
			delete(c, "exp")
			return sign(t, iss, c)
		}},
		{name: "nbf が先", token: func(t *testing.T) string {
			c := iss.Claims(audience, "sub-1")
			c["nbf"] = now.Add(time.Hour).Unix()
			return sign(t, iss, c)
		}},
		{name: "aud が違う", token: func(t *testing.T) string {
			return sign(t, iss, iss.Claims("schedule-api", "sub-1"))
		}},
		{name: "iss が違う", token: func(t *testing.T) string {
			c := iss.Claims(audience, "sub-1")
			c["iss"] = "https://evil.example.com"
			return sign(t, iss, c)
		}},
		{name: "sub がない", token: func(t *testing.T) string {
			c := iss.Claims(audience, "sub-1")
			delete(c, "sub")
			return sign(t, iss, c)
		}},
		{name: "署名を書き換えた", token: func(t *testing.T) string {
			raw := sign(t, iss, iss.Claims(audience, "sub-1"))
			parts := strings.Split(raw, ".")
			other := sign(t, iss, iss.Claims(audience, "sub-2"))
			return parts[0] + "." + parts[1] + "." + strings.Split(other, ".")[2]
		}},
		{name: "alg が none", token: func(t *testing.T) string {
			raw, err := jwt.NewWithClaims(jwt.SigningMethodNone, iss.Claims(audience, "sub-1")).
				SignedString(jwt.UnsafeAllowNoneSignatureType)
			if err != nil {
				t.Fatal(err)
			}
			return raw
		}},
		{name: "alg が HS256", token: func(t *testing.T) string {
			tok := jwt.NewWithClaims(jwt.SigningMethodHS256, iss.Claims(audience, "sub-1"))
			tok.Header["kid"] = "key-1"
			raw, err := tok.SignedString([]byte("shared-secret"))
			if err != nil {
				t.Fatal(err)
			}
			return raw
		}},
		{name: "形が JWT でない", token: func(*testing.T) string { return "not-a-jwt" }},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if id, err := v.Verify(context.Background(), tt.token(t)); err == nil {
				t.Fatalf("err = nil, id = %+v", id)
			}
		})
	}
}

func TestVerifyRejectsKeyNotInJWKS(t *testing.T) {
	iss, v := setup(t)
	if err := iss.AddUnpublishedKey("key-1"); err != nil {
		t.Fatal(err)
	}
	if _, err := v.Verify(context.Background(), sign(t, iss, iss.Claims(audience, "sub-1"))); err == nil {
		t.Fatal("JWKS にない鍵の署名を受け付けた")
	}
}

func TestVerifyRefetchesJWKSForUnknownKID(t *testing.T) {
	iss, v := setup(t)
	ctx := context.Background()
	if _, err := v.Verify(ctx, sign(t, iss, iss.Claims(audience, "sub-1"))); err != nil {
		t.Fatal(err)
	}
	before := iss.JWKSRequests()

	if _, err := iss.AddKey("RS256"); err != nil {
		t.Fatal(err)
	}
	if _, err := v.Verify(ctx, sign(t, iss, iss.Claims(audience, "sub-1"))); err != nil {
		t.Fatalf("鍵を足した後のトークン: %v", err)
	}
	if got := iss.JWKSRequests(); got != before+1 {
		t.Fatalf("JWKS の取得 = %d 回, want %d", got, before+1)
	}

	if err := iss.AddUnpublishedKey("key-unknown"); err != nil {
		t.Fatal(err)
	}
	start := time.Now()
	if _, err := v.Verify(ctx, sign(t, iss, iss.Claims(audience, "sub-1"))); err == nil {
		t.Fatal("JWKS にない kid を受け付けた")
	}
	if got := iss.JWKSRequests(); got != before+1 {
		t.Errorf("間隔の下限の中で JWKS を取り直した: %d 回", got)
	}
	if time.Since(start) > time.Second {
		t.Errorf("取り直しの順番を %v 待った", time.Since(start))
	}
}

func TestNewVerifierRejectsIssuerMismatch(t *testing.T) {
	iss, err := oidctest.Start()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(iss.Close)
	_, err = oidc.NewVerifier(t.Context(), oidc.Config{Issuer: iss.URL() + "/", Audience: audience, OrgClaim: "org_id"},
		iss.Client(), slog.New(slog.NewTextHandler(io.Discard, nil)))
	if err == nil || !strings.Contains(err.Error(), "issuer") {
		t.Fatalf("err = %v", err)
	}
}
