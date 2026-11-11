package internalapi_test

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/Fukuemon/buddy/services/broker/internal/internalapi"
	"github.com/Fukuemon/buddy/services/broker/internal/staff"
)

// slowStore は、Get で ctx が終わるまで待つ internalapi.Store である。答えない DB の代わりに使う。
// 上限が付いていなくてもテストが止まらないよう、wait を過ぎたら有効な職員を返す。
type slowStore struct {
	*fakeStore
	wait     time.Duration
	deadline time.Time
	hasLimit bool
}

func (s *slowStore) Get(ctx context.Context, id string) (staff.Member, error) {
	s.deadline, s.hasLimit = ctx.Deadline()
	select {
	case <-ctx.Done():
		return staff.Member{}, ctx.Err()
	case <-time.After(s.wait):
		return s.fakeStore.Get(ctx, id)
	}
}

func newHookHandler(logger *slog.Logger, store internalapi.Store, dbTimeout time.Duration) http.Handler {
	return internalapi.NewHandler(internalapi.Config{
		Logger:             logger,
		Staff:              store,
		Hydra:              &fakeHydra{},
		Verifier:           fakeVerifier{},
		Clients:            []string{"schedule"},
		OnboardingClients:  []string{"schedule-ops"},
		TokenHookKey:       hookKey,
		TokenHookDBTimeout: dbTimeout,
		Now:                func() time.Time { return now },
	})
}

func callHook(h http.Handler, key, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodPost, "/internal/token-hook", strings.NewReader(body))
	if key != "" {
		req.Header.Set(internalapi.TokenHookKeyHeader, key)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

var activeStaff = staff.Member{ID: staffA, OrgID: "org-a", Email: "a@example.com", Status: staff.StatusActive}

// 検証の観点 1: DB が答えないとき、hook は待ちの上限の後に 500 を返す。
func TestTokenHookDBTimeout(t *testing.T) {
	const limit = 50 * time.Millisecond
	store := &slowStore{fakeStore: newStore(activeStaff), wait: 5 * time.Second}
	start := time.Now()
	rec := callHook(newHookHandler(slog.New(slog.DiscardHandler), store, limit), hookKey,
		hookBody("web", "refresh_token", staffA, now.Add(-time.Minute)))
	elapsed := time.Since(start)
	if rec.Code != http.StatusInternalServerError {
		t.Errorf("code = %d, want %d", rec.Code, http.StatusInternalServerError)
	}
	if code := errorCode(t, rec); code != "internal" {
		t.Errorf("body code = %q, want internal", code)
	}
	if elapsed < limit || elapsed > time.Second {
		t.Errorf("elapsed = %v, want >= %v and <= 1s", elapsed, limit)
	}
	if !store.hasLimit {
		t.Error("Get の ctx に期限が無い")
	}
}

// 上限を渡さなければ、職員を引く ctx の期限は DefaultTokenHookDBTimeout の後になる。
func TestTokenHookDefaultDBTimeout(t *testing.T) {
	store := &slowStore{fakeStore: newStore(activeStaff)}
	start := time.Now()
	rec := callHook(newHookHandler(slog.New(slog.DiscardHandler), store, 0), hookKey,
		hookBody("web", "refresh_token", staffA, now.Add(-time.Minute)))
	if rec.Code != http.StatusNoContent {
		t.Fatalf("code = %d, want %d", rec.Code, http.StatusNoContent)
	}
	if !store.hasLimit {
		t.Fatal("Get の ctx に期限が無い")
	}
	end := time.Now()
	limit := internalapi.DefaultTokenHookDBTimeout
	if store.deadline.Before(start.Add(limit)) || store.deadline.After(end.Add(limit)) {
		t.Errorf("deadline = start + %v, want start + %v から end + %v の間", store.deadline.Sub(start), limit, limit)
	}
}

// 検証の観点 2: hook の呼び出しごとに、結果と状態コードと所要の時間がログに 1 行出る。
func TestTokenHookLog(t *testing.T) {
	suspended := activeStaff
	suspended.Status = staff.StatusSuspended
	tests := []struct {
		name   string
		store  internalapi.Store
		key    string
		body   string
		result string
		status int
		level  string
	}{
		{"許せば allowed", newStore(activeStaff), hookKey, hookBody("web", "refresh_token", staffA, now.Add(-time.Minute)), "allowed", http.StatusNoContent, "INFO"},
		{"client credentials を許しても allowed", newStore(), hookKey, hookBody("schedule", "client_credentials", "", time.Time{}), "allowed", http.StatusNoContent, "INFO"},
		{"拒めば denied", newStore(suspended), hookKey, hookBody("web", "refresh_token", staffA, now.Add(-time.Minute)), "denied", http.StatusForbidden, "WARN"},
		{"DB の失敗は failed", &fakeStore{err: errors.New("down")}, hookKey, hookBody("web", "refresh_token", staffA, now), "failed", http.StatusInternalServerError, "ERROR"},
		{"鍵の誤りは failed", newStore(activeStaff), "wrong", hookBody("web", "refresh_token", staffA, now), "failed", http.StatusUnauthorized, "WARN"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var buf bytes.Buffer
			logger := slog.New(slog.NewJSONHandler(&buf, nil))
			rec := callHook(newHookHandler(logger, tt.store, 0), tt.key, tt.body)
			if rec.Code != tt.status {
				t.Fatalf("code = %d, want %d", rec.Code, tt.status)
			}
			lines := strings.Split(strings.TrimSpace(buf.String()), "\n")
			if len(lines) != 1 {
				t.Fatalf("ログの行 = %d, want 1: %s", len(lines), buf.String())
			}
			var got struct {
				Level      string `json:"level"`
				Msg        string `json:"msg"`
				Result     string `json:"result"`
				Status     int    `json:"status"`
				DurationMS *int64 `json:"duration_ms"`
			}
			if err := json.Unmarshal([]byte(lines[0]), &got); err != nil {
				t.Fatalf("ログを読めない: %v", err)
			}
			if got.Msg != "token_hook の結果" || got.Result != tt.result || got.Status != tt.status || got.Level != tt.level {
				t.Errorf("log = %+v, want result %s, status %d, level %s", got, tt.result, tt.status, tt.level)
			}
			if got.DurationMS == nil || *got.DurationMS < 0 {
				t.Errorf("duration_ms = %v, want >= 0", got.DurationMS)
			}
		})
	}
}
