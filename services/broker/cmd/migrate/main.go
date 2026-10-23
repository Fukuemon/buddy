// Command migrate は、埋め込んだマイグレーションをブローカーのデータベースに適用する。
//
// 使い方:
//
//	migrate up          未適用のマイグレーションをすべて適用する
//	migrate down [N]    マイグレーションを N 版戻す。N のデフォルトは 1
//
// 接続の設定は、cmd/broker と同じ環境変数（DB_HOST、DB_PORT、DB_USER、DB_PASSWORD、DB_NAME）から読む。
// 引数が誤っているときは終了コード 2、処理が失敗したときは 1 で終わる。
package main

import (
	"fmt"
	"log/slog"
	"os"
	"strconv"

	"github.com/Fukuemon/buddy/services/broker/internal/config"
	"github.com/Fukuemon/buddy/services/broker/internal/postgres"
)

func main() {
	if len(os.Args) < 2 {
		usage()
	}
	dbCfg, err := config.LoadDB(os.Getenv)
	if err != nil {
		fail(err)
	}
	cfg := postgres.Config(dbCfg)
	switch os.Args[1] {
	case "up":
		err = postgres.MigrateUp(cfg)
	case "down":
		steps := 1
		if len(os.Args) > 2 {
			if steps, err = strconv.Atoi(os.Args[2]); err != nil || steps < 1 {
				usage()
			}
		}
		err = postgres.MigrateDown(cfg, steps)
	default:
		usage()
	}
	if err != nil {
		fail(err)
	}
	slog.Info("done", slog.String("command", os.Args[1]))
}

func usage() {
	fmt.Fprintln(os.Stderr, "usage: migrate up | down [N]")
	os.Exit(2)
}

func fail(err error) {
	slog.Error("migrate failed", slog.Any("error", err))
	os.Exit(1)
}
