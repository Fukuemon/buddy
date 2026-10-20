package check

import (
	"bytes"
	"encoding/csv"
	"os"
	"path/filepath"
	"slices"
	"testing"

	"github.com/Fukuemon/buddy/apps/receipt-api/tools/parity/report"
)

// TestRunParity は、testdata/parity の各ケースの結果の CSV を、Python の結果から作った expected.csv と比べる。
// expected.csv の作り方は tools/parity/README.md にある。
func TestRunParity(t *testing.T) {
	dirs, err := filepath.Glob(filepath.Join("..", "..", "testdata", "parity", "*"))
	if err != nil {
		t.Fatal(err)
	}
	if len(dirs) == 0 {
		t.Fatal("testdata/parity にケースがない")
	}
	for _, dir := range dirs {
		t.Run(filepath.Base(dir), func(t *testing.T) {
			read := func(name string) []byte {
				b, err := os.ReadFile(filepath.Join(dir, name))
				if err != nil {
					t.Fatal(err)
				}
				return b
			}
			rep := run(t, read("visits.csv"), read("schedules.csv"))
			var buf bytes.Buffer
			if err := report.Write(&buf, rep.Rows); err != nil {
				t.Fatal(err)
			}
			got := parseReport(t, buf.Bytes())
			want := parseReport(t, read("expected.csv"))
			for i := range max(len(got), len(want)) {
				var g, w []string
				if i < len(got) {
					g = got[i]
				}
				if i < len(want) {
					w = want[i]
				}
				if !slices.Equal(g, w) {
					t.Errorf("行 %d:\n got  %q\n want %q", i+1, g, w)
				}
			}
		})
	}
}

func parseReport(t *testing.T, b []byte) [][]string {
	t.Helper()
	b, ok := bytes.CutPrefix(b, []byte("\xEF\xBB\xBF"))
	if !ok {
		t.Fatal("BOM がない")
	}
	rows, err := csv.NewReader(bytes.NewReader(b)).ReadAll()
	if err != nil {
		t.Fatal(err)
	}
	return rows
}
