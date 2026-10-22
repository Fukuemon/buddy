// Command migrate は、埋め込んだマイグレーションとシードをデータベースに適用する。
//
// 使い方:
//
//	migrate up          未適用のマイグレーションをすべて適用する
//	migrate down [N]    マイグレーションを N 版戻す。N のデフォルトは 1
//	migrate seed        ダミーデータを入れる。事業所のレコードが既にあれば何もしない
//
// 接続の設定は、cmd/api と同じ環境変数（DB_HOST、DB_PORT、DB_USER、DB_PASSWORD、DB_NAME）から読む。
// 引数が誤っているときは終了コード 2、処理が失敗したときは 1 で終わる。
package main

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"strconv"

	"github.com/Fukuemon/buddy/services/schedule/db"
	"github.com/Fukuemon/buddy/services/schedule/internal/config"
	"github.com/Fukuemon/buddy/services/schedule/internal/postgres"
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
	case "seed":
		var applied bool
		if applied, err = postgres.Seed(context.Background(), cfg, db.Seed); err == nil && !applied {
			slog.Info("skipped seed: facilities already exist")
		}
	default:
		usage()
	}
	if err != nil {
		fail(err)
	}
	slog.Info("done", slog.String("command", os.Args[1]))
}

func usage() {
	fmt.Fprintln(os.Stderr, "usage: migrate up | down [N] | seed")
	os.Exit(2)
}

func fail(err error) {
	slog.Error("migrate failed", slog.Any("error", err))
	os.Exit(1)
}
