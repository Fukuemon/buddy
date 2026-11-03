package csvio

import (
	"errors"
	"strings"
	"testing"

	"golang.org/x/text/encoding/japanese"

	"github.com/Fukuemon/buddy/services/receipt/internal/record"
)

const sample = "訪問日,利用者名\n2024/04/01,利用者A\n"

func TestDecode(t *testing.T) {
	cp932, err := japanese.ShiftJIS.NewEncoder().Bytes([]byte(sample))
	if err != nil {
		t.Fatal(err)
	}
	tests := []struct {
		name string
		in   []byte
	}{
		{"UTF-8", []byte(sample)},
		{"BOM 付きの UTF-8", append([]byte(utf8BOM), sample...)},
		{"CP932", cp932},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := Decode(tt.in)
			if err != nil {
				t.Fatal(err)
			}
			if got != sample {
				t.Errorf("got %q", got)
			}
		})
	}
}

func TestDecodeInvalid(t *testing.T) {
	_, err := Decode([]byte{0x81, 0x20, 0xFF})
	if !errors.Is(err, ErrEncoding) {
		t.Fatalf("err = %v", err)
	}
}

// inputErrors は、err が *record.InputError なら誤りの一覧を返し、違えばテストを止める。
func inputErrors(t *testing.T, err error) []record.CSVError {
	t.Helper()
	ie, ok := errors.AsType[*record.InputError](err)
	if !ok {
		t.Fatalf("err = %v", err)
	}
	return ie.Errors
}

func TestReadTableFileErrors(t *testing.T) {
	tests := []struct {
		name string
		data []byte
		want []record.CSVError
	}{
		{"文字コードを読めない", []byte{0x81, 0x20, 0xFF}, []record.CSVError{{Reason: record.ReasonEncoding}}},
		{"空", nil, []record.CSVError{{Reason: record.ReasonEmptyFile}}},
		{"列が足りない", []byte("訪問日,利用者名,開始時間,終了時間,サービス内容\n"), []record.CSVError{
			{Reason: record.ReasonMissingColumn, Column: ColDuration},
			{Reason: record.ReasonMissingColumn, Column: ColStaff},
		}},
		{"引用符の閉じ忘れ", []byte(strings.Join(ScheduleColumns(), ",") + "\n2024/04/01,\"利用者A\n"), []record.CSVError{{Reason: record.ReasonMalformedRow, Line: 2}}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := ReadTable(tt.data, record.InputSchedule, ScheduleColumns())
			got := inputErrors(t, err)
			if len(got) != len(tt.want) {
				t.Fatalf("errors = %+v", got)
			}
			for i, w := range tt.want {
				g := got[i]
				if g.Input != record.InputSchedule || g.Reason != w.Reason || g.Line != w.Line || g.Column != w.Column || g.Message == "" {
					t.Errorf("errors[%d] = %+v, want %+v", i, g, w)
				}
			}
		})
	}
}

func TestReadTable(t *testing.T) {
	data := "訪問日, 利用者名 ,余分\n2024/04/01,利用者A,x\n,,\n2024/04/02\n"
	rows, err := ReadTable([]byte(data), record.InputVisit, []string{ColDate, ColClient})
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 2 {
		t.Fatalf("rows = %d, want 2（空の行を読み飛ばす）", len(rows))
	}
	if rows[0].Line != 2 || rows[0].Get(ColClient) != "利用者A" {
		t.Errorf("rows[0] = %+v", rows[0])
	}
	if rows[1].Line != 4 || rows[1].Get(ColClient) != "" {
		t.Errorf("rows[1] = %+v", rows[1])
	}
}
