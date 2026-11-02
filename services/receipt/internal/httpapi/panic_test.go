package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"
	"testing"

	"github.com/Fukuemon/buddy/services/receipt/internal/httpapi/openapi"
)

// panicPermission は、照合の権限の確認で panic する PermissionChecker である。
type panicPermission struct{}

func (panicPermission) RequireReceiptCheck(context.Context, string) error {
	panic("permission の確認で panic した")
}

func TestPanicReturnsInternal(t *testing.T) {
	var logs bytes.Buffer
	logger := slog.New(slog.NewJSONHandler(&logs, nil))
	h := NewHandler(logger, Config{MaxUploadBytes: 1 << 20, Verifier: fakeVerifier{}, Permission: panicPermission{}})

	rec := post(t, h, validFiles(t), "")

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want 500", rec.Code)
	}
	if ct := rec.Header().Get("Content-Type"); ct != "application/json" {
		t.Errorf("Content-Type = %q", ct)
	}
	var body openapi.Error
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("本文が JSON でない: %v: %s", err, rec.Body)
	}
	if body.Code != openapi.Internal {
		t.Errorf("code = %q, want %q", body.Code, openapi.Internal)
	}
	if !strings.Contains(logs.String(), `"level":"ERROR"`) || !strings.Contains(logs.String(), "permission の確認で panic した") {
		t.Errorf("panic の値がエラーのログに無い: %s", logs.String())
	}
	if !strings.Contains(logs.String(), `"status":500`) {
		t.Errorf("アクセスログに 500 が無い: %s", logs.String())
	}
}
