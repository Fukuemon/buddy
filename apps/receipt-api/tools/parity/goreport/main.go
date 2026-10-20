// Command goreport は、実績と予定の CSV を照合し、Python の結果と同じ形の記号つきの CSV を標準出力に書く。
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
	"github.com/Fukuemon/buddy/apps/receipt-api/tools/parity/report"
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
	return report.Write(os.Stdout, rep.Rows)
}
