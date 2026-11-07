package postgres

import (
	"testing"

	"github.com/jackc/pgx/v5"

	"github.com/Fukuemon/buddy/packages/go/servicecode"
)

// TestServiceCodesMatchServicecode は、マイグレーションが入れた service_codes の全ての行の提供時間の範囲が、
// 照合の API と共有する servicecode の表と同じことを確認する（ADR-0023）。servicecode の表の範囲を変えてシードを直し忘れると失敗する。
// 表にだけあるサービス内容（シードに無い医療保険の項目など）は確認しない。
func TestServiceCodesMatchServicecode(t *testing.T) {
	ctx := txContext(t)
	rows, err := testDB.Query(ctx, `SELECT code, service_time_range_start, service_time_range_end FROM service_codes ORDER BY code`)
	if err != nil {
		t.Fatal(err)
	}
	type row struct {
		Code       string
		Start, End int
	}
	got, err := pgx.CollectRows(rows, pgx.RowToStructByPos[row])
	if err != nil {
		t.Fatal(err)
	}
	if len(got) == 0 {
		t.Fatal("service_codes が空である")
	}
	for _, r := range got {
		want, ok := servicecode.Lookup(servicecode.Normalize(r.Code))
		if !ok {
			t.Errorf("%s が servicecode の表に無い", r.Code)
			continue
		}
		if (servicecode.Range{Min: r.Start, Max: r.End}) != want {
			t.Errorf("%s の範囲 = %d~%d, want servicecode の %s", r.Code, r.Start, r.End, want)
		}
	}
}
