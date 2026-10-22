package csvio

import (
	"errors"
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
	var ie *record.InputError
	if !errors.As(err, &ie) {
		t.Fatalf("err = %v", err)
	}
}

func TestReadTable(t *testing.T) {
	data := "訪問日, 利用者名 ,余分\n2024/04/01,利用者A,x\n,,\n2024/04/02\n"
	rows, err := ReadTable([]byte(data), record.SourceVisit, []string{ColDate, ColClient})
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

func TestReadTableMissingColumns(t *testing.T) {
	_, err := ReadTable([]byte("訪問日\n2024/04/01\n"), record.SourceSchedule, ScheduleColumns())
	var ie *record.InputError
	if !errors.As(err, &ie) {
		t.Fatalf("err = %v", err)
	}
}

func TestReadTableEmpty(t *testing.T) {
	_, err := ReadTable(nil, record.SourceSchedule, ScheduleColumns())
	var ie *record.InputError
	if !errors.As(err, &ie) {
		t.Fatalf("err = %v", err)
	}
}
