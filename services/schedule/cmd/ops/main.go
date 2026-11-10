// Command ops は、予定の API の運営用の CLI である。本番ではマイグレーションと同じく、内部のネットワークの 1 回のジョブとして流す。
// 公開のポートを持たず、HTTP のサーバーを起動しない。
//
// 使い方:
//
//	ops onboard-facility --org-id <組織の ID> --facility-name <事業所の名前> --department <部署の名前> --team <チームの名前> \
//	    --manager-name <マネージャーの名前> --manager-email <マネージャーのメール> --operator <運営者の ID> \
//	    [--allow-additional-manager] [--dry-run]
//
// onboard-facility は、事業所、標準の 4 つの役職とデフォルトの権限、最初のマネージャーを 1 回で登録する。
// 職員の登録は web からの登録と同じ処理を通り、ブローカーへの書き込みが失敗すると予定の API の書き込みを全て戻す。
// 同じ引数で流し直しても、事業所、役職、職員は重ならない。--dry-run は、DB とブローカーに書かずに、書く内容を出す。
//
// 設定は internal/config の LoadOps が読む環境変数である。ブローカーは運営用のクライアント（デフォルトは schedule-ops）で呼ぶ。
// 引数が誤っているときは終了コード 2、処理が失敗したときは 1 で終わる。
package main

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/Fukuemon/buddy/services/schedule/internal/config"
	"github.com/Fukuemon/buddy/services/schedule/internal/postgres"
)

func main() {
	os.Exit(run(os.Args[1:], os.Getenv, os.Stdout, os.Stderr))
}

// run は、args のサブコマンドを流し、終了コードを返す。
func run(args []string, getenv func(string) string, stdout, stderr io.Writer) int {
	if len(args) < 1 || args[0] != "onboard-facility" {
		_, _ = fmt.Fprintln(stderr, "usage: ops onboard-facility --org-id <id> --facility-name <name> --department <name> --team <name> --manager-name <name> --manager-email <email> --operator <id> [--allow-additional-manager] [--dry-run]")
		return 2
	}
	in, err := parseOnboardArgs(args[1:], stderr)
	if err != nil {
		_, _ = fmt.Fprintln(stderr, err)
		return 2
	}
	cfg, err := config.LoadOps(getenv)
	if err != nil {
		_, _ = fmt.Fprintln(stderr, err)
		return 1
	}
	log := slog.New(slog.NewJSONHandler(stdout, &slog.HandlerOptions{Level: cfg.LogLevel})).With(slog.String("component", "ops"))

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	db, err := postgres.Open(ctx, postgres.Config(cfg.DB))
	if err != nil {
		log.Error("ops failed", slog.String("error", err.Error()))
		return 1
	}
	defer db.Close()

	if err := onboardFacility(ctx, newOnboard(db, cfg.Broker), in, log); err != nil {
		if errors.Is(err, errOnboardFailed) {
			return 1
		}
		log.Error("ops failed", slog.String("error", err.Error()))
		return 1
	}
	return 0
}
