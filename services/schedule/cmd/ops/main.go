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
	"flag"
	"fmt"
	"io"
	"log/slog"
	"os"
	"os/signal"
	"regexp"
	"strings"
	"syscall"

	"github.com/Fukuemon/buddy/services/schedule/internal/config"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/staff"
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
	switch {
	case errors.Is(err, flag.ErrHelp):
		return 0
	case errors.Is(err, errFlagParse):
		// flag が、エラーと使い方を stderr に書いている
		return 2
	case err != nil:
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
		return 1
	}
	return 0
}

// operatorIDPattern は、運営者の ID の形である。メールと名前を登録の記録に入れないよう、英数字と . _ - だけを受ける。
var operatorIDPattern = regexp.MustCompile(`^[A-Za-z0-9._-]{1,64}$`)

// errFlagParse は、flag が引数を読めず、エラーと使い方を stderr に書いた後に、parseOnboardArgs が返す。
var errFlagParse = errors.New("flag parse")

// onboardArgs は、onboard-facility の引数である。Operator は、流した運営者の ID で、登録の記録の実行者になる。
type onboardArgs struct {
	staff.OnboardInput
	Operator string
}

// parseOnboardArgs は、onboard-facility の引数を読む。必須の引数が無いか、--operator がメールの形なら、エラーを返す。
func parseOnboardArgs(args []string, stderr io.Writer) (onboardArgs, error) {
	var a onboardArgs
	fs := flag.NewFlagSet("onboard-facility", flag.ContinueOnError)
	fs.SetOutput(stderr)
	fs.StringVar(&a.Facility.OrgID, "org-id", "", "ブローカーの上流の IdP の設定にある組織の ID")
	fs.StringVar(&a.Facility.Name, "facility-name", "", "事業所の名前")
	fs.StringVar(&a.Facility.DepartmentName, "department", "", "最初のマネージャーを所属させる部署の名前。無ければ作る")
	fs.StringVar(&a.Facility.TeamName, "team", "", "最初のマネージャーを所属させるチームの名前。無ければ作る")
	fs.StringVar(&a.Username, "manager-name", "", "最初のマネージャーの名前")
	fs.StringVar(&a.Email, "manager-email", "", "最初のマネージャーのメール。上流の IdP が確認したメールと同じにする")
	fs.StringVar(&a.Operator, "operator", "", "流した運営者の ID。メールと名前を使わない")
	fs.BoolVar(&a.AllowAdditionalManager, "allow-additional-manager", false, "職員の管理の権限を持つ有効な職員がいる事業所に、マネージャーを足す。全てのマネージャーが退職したときの復旧に使う")
	fs.BoolVar(&a.DryRun, "dry-run", false, "DB とブローカーに書かずに、書く内容を出す")
	if err := fs.Parse(args); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return onboardArgs{}, err
		}
		return onboardArgs{}, fmt.Errorf("%w: %w", errFlagParse, err)
	}
	if fs.NArg() > 0 {
		// 値は職員の名前の一部のことがあるので、出さない
		return onboardArgs{}, fmt.Errorf("知らない引数が %d 個あります。値に空白を含むときは引用符で囲みます", fs.NArg())
	}
	var missing []string
	for _, v := range []struct{ name, value string }{
		{"--org-id", a.Facility.OrgID}, {"--facility-name", a.Facility.Name}, {"--department", a.Facility.DepartmentName},
		{"--team", a.Facility.TeamName}, {"--manager-name", a.Username}, {"--manager-email", a.Email}, {"--operator", a.Operator},
	} {
		if strings.TrimSpace(v.value) == "" {
			missing = append(missing, v.name)
		}
	}
	if len(missing) > 0 {
		return onboardArgs{}, fmt.Errorf("引数 %s が必要です", strings.Join(missing, "、"))
	}
	if !operatorIDPattern.MatchString(a.Operator) {
		return onboardArgs{}, errors.New("--operator には、英数字と . _ - の 64 文字までの運営者の ID を渡します。メールと名前を使いません")
	}
	return a, nil
}
