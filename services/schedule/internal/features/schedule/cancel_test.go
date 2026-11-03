package schedule_test

import (
	"errors"
	"testing"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/inmem"
)

func TestSchedulesCancel(t *testing.T) {
	s := inmem.Seeded()
	uc, tx := newSchedules(s)
	ctx := editorCtx()
	created, err := uc.Create(ctx, facilityID, normalSlot())
	if err != nil {
		t.Fatal(err)
	}
	before := tx.Calls
	if _, err := uc.Cancel(ctx, "MISSING", "体調不良"); !errors.Is(err, apperr.ErrNotFound) {
		t.Fatalf("err = %v, want ErrNotFound", err)
	}
	if _, err := uc.Cancel(ctx, created.ID, ""); !errors.Is(err, apperr.ErrInvalidInput) {
		t.Fatalf("err = %v, want ErrInvalidInput", err)
	}
	if _, err := uc.Cancel(ctx, created.ID, "体調不良"); err != nil {
		t.Fatal(err)
	}
	if tx.Calls == before {
		t.Error("キャンセルがトランザクションの中で予定をロックしていない")
	}
	if _, err := uc.Cancel(ctx, created.ID, "体調不良"); !errors.Is(err, apperr.ErrConflict) || err.Error() != "この予定はすでにキャンセルされています" {
		t.Fatalf("err = %v, want キャンセル済みの ErrConflict", err)
	}
}
