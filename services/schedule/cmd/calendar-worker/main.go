// Command calendar-worker は、Google カレンダーの書き出しか同期を、役割ごとのプロセスで動かす（ADR-0032）。
//
// 使い方:
//
//	calendar-worker export [--once [--max-duration 時間]]  予定を Google カレンダーに書き出す
//	calendar-worker sync [--once [--max-duration 時間]]    Google カレンダーの変更を buddy の予定に当てる
//
// --once を付けなければ常駐し、役割の間隔ごとに取れるものを処理し続ける。--once を付けると、取れるものが無くなるまで処理して終わる。
// --max-duration は --once の長さの上限（Go の時間の書式）で、達したら新しく取るのをやめる。0 なら上限を設けない。
// SIGINT か SIGTERM を受けると、新しく取るのをやめ、取った待ちとカレンダーの結果を書いてから終わる。
//
// 設定は internal/config の LoadWorker が読む環境変数である。役割のフラグ（GOOGLE_CALENDAR_EXPORT_ENABLED か
// GOOGLE_CALENDAR_SYNC_ENABLED）が無効なら、DB に繋がずに、そのことをログに書いて終わる。
//
// 終了のコードは次のとおり。1 つの予定やカレンダーの失敗は、待ちと同期の状態に書き、終了のコードに出さない。
//   - 0: 最後まで処理したか、役割のフラグが無効で処理をしなかった
//   - 1: 設定の誤りか、DB に繋がらない。--once で待ちとカレンダーを取れなかったときも含む
//   - 2: 引数の誤り
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/assemble"
	"github.com/Fukuemon/buddy/services/schedule/internal/config"
)

// role は、Worker の役割である。
type role struct {
	// component は、ログの component の値である。
	component string
	// flag は、役割を有効にする環境変数の名前である。
	flag    string
	enabled func(config.Calendar) bool
}

var roles = map[string]role{
	"export": {component: "calendar-export", flag: "GOOGLE_CALENDAR_EXPORT_ENABLED", enabled: func(c config.Calendar) bool { return c.ExportEnabled }},
	"sync":   {component: "calendar-sync", flag: "GOOGLE_CALENDAR_SYNC_ENABLED", enabled: func(c config.Calendar) bool { return c.SyncEnabled }},
}

// options は、引数から読んだ実行の形である。
type options struct {
	name        string
	role        role
	once        bool
	maxDuration time.Duration
}

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	code := run(ctx, os.Args[1:], os.Getenv, os.Stdout, os.Stderr)
	stop()
	os.Exit(code)
}

// run は、args の役割を getenv の設定で動かし、終了のコードを返す。ログは stdout に、引数の誤りは stderr に書く。
func run(ctx context.Context, args []string, getenv func(string) string, stdout, stderr io.Writer) int {
	opts, err := parseArgs(args, stderr)
	if err != nil {
		return 2
	}
	cfg, err := config.LoadWorker(getenv)
	log := slog.New(slog.NewJSONHandler(stdout, &slog.HandlerOptions{Level: cfg.LogLevel})).With(slog.String("component", opts.role.component))
	if err != nil {
		log.Error("calendar worker stopped", slog.Any("error", err))
		return 1
	}
	if !opts.role.enabled(cfg.Calendar) {
		log.Info("calendar worker disabled", slog.String("flag", opts.role.flag))
		return 0
	}
	if err := work(ctx, cfg, opts, log); err != nil {
		log.Error("calendar worker stopped", slog.Any("error", err))
		return 1
	}
	return 0
}

// parseArgs は、役割と、その後のフラグを読む。誤っていれば使い方を stderr に書いてエラーを返す。
func parseArgs(args []string, stderr io.Writer) (options, error) {
	usage := func(err error) (options, error) {
		_, _ = fmt.Fprintf(stderr, "%v\n使い方: calendar-worker export|sync [--once [--max-duration 時間]]\n", err)
		return options{}, err
	}
	if len(args) == 0 {
		return usage(errors.New("役割を指定する"))
	}
	r, ok := roles[args[0]]
	if !ok {
		return usage(fmt.Errorf("役割 %q は export か sync である", args[0]))
	}
	opts := options{name: args[0], role: r}
	fs := flag.NewFlagSet("calendar-worker "+args[0], flag.ContinueOnError)
	fs.SetOutput(stderr)
	fs.BoolVar(&opts.once, "once", false, "取れるものが無くなるまで処理して終わる")
	fs.DurationVar(&opts.maxDuration, "max-duration", 0, "--once の長さの上限。0 なら上限を設けない")
	if err := fs.Parse(args[1:]); err != nil {
		return options{}, err
	}
	switch {
	case fs.NArg() > 0:
		return usage(fmt.Errorf("余分な引数 %q がある", fs.Args()))
	case opts.maxDuration < 0:
		return usage(errors.New("--max-duration は 0 以上の時間である"))
	case opts.maxDuration > 0 && !opts.once:
		return usage(errors.New("--max-duration は --once と一緒に渡す"))
	}
	return opts, nil
}

// work は、DB に繋いで役割の処理を組み立て、常駐か 1 回の形で動かす。
func work(ctx context.Context, cfg config.Worker, opts options, log *slog.Logger) error {
	db, err := assemble.OpenDB(ctx, cfg.DB)
	if err != nil {
		return err
	}
	defer db.Close()
	repos := assemble.NewRepositories(db)
	accounts, err := assemble.NewCalendarAccounts(ctx, cfg.Calendar, repos)
	if err != nil {
		return err
	}
	var due dueFunc
	switch opts.name {
	case "export":
		due = assemble.NewExporter(repos, accounts, log).ExportDue
	case "sync":
		s := assemble.NewSyncer(repos, accounts, cfg.Calendar.SyncInterval, log)
		due = sequence(s.SyncDue, s.ReadBackDue)
	}
	if !opts.once {
		log.Info("calendar worker started")
		resident(ctx, due, pollInterval(opts.name, cfg.Calendar), log)
		log.Info("calendar worker stopped")
		return nil
	}
	n, err := drain(ctx, due, opts.maxDuration, log)
	if err != nil {
		return err
	}
	log.Info("calendar worker finished", slog.Int("claimed", n))
	return nil
}
