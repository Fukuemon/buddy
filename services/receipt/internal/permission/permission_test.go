package permission

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestRequireReceiptCheck(t *testing.T) {
	tests := []struct {
		name          string
		status        int
		body          string
		wantErr       bool
		wantForbidden bool
	}{
		{"照合の権限を持つ", http.StatusOK, `{"policies":[{"code":"schedule.self.edit"},{"code":"receipt.check"}]}`, false, false},
		{"照合の権限を持たない", http.StatusOK, `{"policies":[{"code":"schedule.all.edit"}]}`, true, true},
		{"権限が空", http.StatusOK, `{"policies":[]}`, true, true},
		{"予定の API が 401 を返した", http.StatusUnauthorized, `{}`, true, true},
		{"予定の API が休職か退職の職員を 403 で拒んだ", http.StatusForbidden, `{}`, true, true},
		{"予定の API が 500 を返した", http.StatusInternalServerError, `{}`, true, false},
		{"本文が JSON でない", http.StatusOK, `not json`, true, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.Method != http.MethodGet || r.URL.Path != "/v1/me" || r.Header.Get("Authorization") != "Bearer token-1" {
					t.Errorf("リクエスト = %s %s %q", r.Method, r.URL.Path, r.Header.Get("Authorization"))
				}
				w.WriteHeader(tt.status)
				_, _ = w.Write([]byte(tt.body))
			}))
			defer srv.Close()
			c, err := NewChecker(srv.URL)
			if err != nil {
				t.Fatal(err)
			}
			err = c.RequireReceiptCheck(context.Background(), "token-1")
			if (err != nil) != tt.wantErr || errors.Is(err, ErrForbidden) != tt.wantForbidden {
				t.Errorf("err = %v, wantErr %v, wantForbidden %v", err, tt.wantErr, tt.wantForbidden)
			}
		})
	}
}

func TestRequireReceiptCheckUnreachable(t *testing.T) {
	srv := httptest.NewServer(http.NotFoundHandler())
	srv.Close()
	c, err := NewChecker(srv.URL)
	if err != nil {
		t.Fatal(err)
	}
	if err := c.RequireReceiptCheck(context.Background(), "token-1"); err == nil || errors.Is(err, ErrForbidden) {
		t.Errorf("err = %v, want 届かないエラー", err)
	}
}

func TestNewChecker(t *testing.T) {
	for _, bad := range []string{"", "schedule:8080", "ftp://schedule", "http://"} {
		if _, err := NewChecker(bad); err == nil {
			t.Errorf("NewChecker(%q) でエラーにならない", bad)
		}
	}
}
