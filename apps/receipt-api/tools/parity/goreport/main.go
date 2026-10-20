// Command goreport は、実績と予定の CSV を照合し、結果の CSV を標準出力に書く。
// POST /v1/checks に Accept: text/csv で送ったときと同じ CSV を返す。
//
//	go run ./tools/parity/goreport VISITS SCHEDULES > OUT
//
// 入力の誤りや読めないファイルでは、標準エラーに書いて終了コード 1 で終わる。
package main

import (
	"context"
	"fmt"
	"os"

	"github.com/Fukuemon/buddy/apps/receipt-api/internal/check"
	"github.com/Fukuemon/buddy/apps/receipt-api/internal/csvio"
)

func main() {
	if err := run(os.Args[1:]); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run(args []string) error {
	if len(args) != 2 {
		return fmt.Errorf("使い方: goreport VISITS SCHEDULES")
	}
	visits, err := os.ReadFile(args[0])
	if err != nil {
		return err
	}
	schedules, err := os.ReadFile(args[1])
	if err != nil {
		return err
	}
	rep, err := check.Run(context.Background(), visits, check.CSVSchedules{Data: schedules})
	if err != nil {
		return err
	}
	return csvio.WriteReport(os.Stdout, rep.Rows)
}
