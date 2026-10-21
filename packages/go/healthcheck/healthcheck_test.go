package healthcheck

import (
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
)

func TestHealthcheck(t *testing.T) {
	serve := func(t *testing.T, status int) string {
		t.Helper()
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path != "/readyz" {
				w.WriteHeader(http.StatusNotFound)
				return
			}
			w.WriteHeader(status)
		}))
		t.Cleanup(srv.Close)
		u, err := url.Parse(srv.URL)
		if err != nil {
			t.Fatal(err)
		}
		return u.Port()
	}
	tests := []struct {
		name string
		port func(t *testing.T) string
		want int
	}{
		{"readyz が 200 なら 0", func(t *testing.T) string { return serve(t, http.StatusOK) }, 0},
		{"readyz が 503 なら 1", func(t *testing.T) string { return serve(t, http.StatusServiceUnavailable) }, 1},
		{"PORT が数でなければ 1", func(*testing.T) string { return "x" }, 1},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Setenv("PORT", tt.port(t))
			if got := Run(); got != tt.want {
				t.Errorf("Run() = %d, want %d", got, tt.want)
			}
		})
	}
}
