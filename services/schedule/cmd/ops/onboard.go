package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"log/slog"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/Fukuemon/buddy/services/schedule/internal/broker"
	"github.com/Fukuemon/buddy/services/schedule/internal/config"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/staff"
	"github.com/Fukuemon/buddy/services/schedule/internal/postgres"
	"github.com/Fukuemon/buddy/services/schedule/internal/ulid"
)

// operationOnboardFacility は、登録の記録の操作の種類である。
const operationOnboardFacility = "facility.onboard"

// errOnboardFailed は、onboardFacility が失敗をログに書いた後に返す。呼び出し側はログを重ねて書かない。
var errOnboardFailed = errors.New("onboard failed")

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
		return onboardArgs{}, err
	}
	if fs.NArg() > 0 {
		return onboardArgs{}, fmt.Errorf("知らない引数 %q があります", fs.Arg(0))
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
	if strings.Contains(a.Operator, "@") {
		return onboardArgs{}, errors.New("--operator には、メールでなく運営者の ID を渡します")
	}
	return a, nil
}

// onboardFunc は、staff.Onboard の Do である。
type onboardFunc func(ctx context.Context, in staff.OnboardInput) (staff.OnboardResult, error)

// newOnboard は、DB と運営用のクライアントのブローカーで staff.Onboard を組み立てる。職員の登録は、web からの登録と同じ
// staff.Create を通す。権限の確認は、運営者が DB と運営用のクライアントの secret を持つことで済んでいるので、常に許す。
func newOnboard(db *pgxpool.Pool, brokerCfg config.Broker) onboardFunc {
	var (
		tx          = postgres.NewTransactor(db)
		ids         = ulid.Generator{}
		facilities  = postgres.NewFacilityRepository(db)
		departments = postgres.NewDepartmentRepository(db)
		teams       = postgres.NewTeamRepository(db)
		positions   = postgres.NewPositionRepository(db)
		policies    = postgres.NewPolicyRepository(db)
		staffRepo   = postgres.NewStaffRepository(db)
		allow       = func(context.Context) error { return nil }
	)
	setup := organization.NewSetupFacility(facilities, facilities, departments, teams, positions, policies, ids)
	create := staff.NewCreate(facilities, departments, teams, positions, broker.New(broker.Config(brokerCfg), nil), staffRepo, tx, ids, allow)
	return staff.NewOnboard(setup.Do, create.Do, staffRepo, facilities, tx).Do
}

// onboardFacility は、do で登録し、登録の記録を log に JSON で書く。記録は、実行者、操作の種類、事業所と職員の ID、
// 作ったもの、実行ごとの相関の ID を持ち、メールと職員の名前を持たない。失敗したときは、メールを伏せた理由を書いてから
// errOnboardFailed を返す。
func onboardFacility(ctx context.Context, do onboardFunc, a onboardArgs, log *slog.Logger) error {
	log = log.With(
		slog.String("actor", a.Operator),
		slog.String("operation", operationOnboardFacility),
		slog.String("correlation_id", ulid.Generator{}.NewID()),
		slog.Bool("dry_run", a.DryRun),
	)
	res, err := do(ctx, a.OnboardInput)
	if err != nil {
		log.Error("事業所と最初のマネージャーを登録できなかった", slog.String("org_id", a.Facility.OrgID),
			slog.String("error", redact(err.Error(), a.Email)))
		return errOnboardFailed
	}
	attrs := []any{
		slog.String("org_id", res.Setup.Facility.OrgID),
		slog.Bool("facility_created", res.Setup.FacilityCreated),
		slog.Any("created_positions", res.Setup.CreatedPositions),
		slog.Bool("department_created", res.Setup.DepartmentCreated),
		slog.Bool("team_created", res.Setup.TeamCreated),
		slog.Bool("manager_created", res.ManagerCreated),
	}
	if a.DryRun {
		// 書かなかったので、ID は持たせない。確認に要る名前だけを出す
		log.Info("書き込まずに、書く内容を出した", append(attrs,
			slog.String("facility_name", res.Setup.Facility.Name),
			slog.String("department_name", res.Setup.Department.Name),
			slog.String("team_name", res.Setup.Team.Name),
			slog.String("manager_position_name", res.Setup.ManagerPosition.Name),
		)...)
		return nil
	}
	log.Info("事業所と最初のマネージャーを登録した", append(attrs,
		slog.String("facility_id", res.Setup.Facility.ID),
		slog.String("staff_id", res.Manager.ID),
	)...)
	return nil
}

// redact は、msg の中の email を伏せる。職員の登録のエラーの文は、メールを含むことがある。
func redact(msg, email string) string {
	if email = strings.TrimSpace(email); email == "" {
		return msg
	}
	msg = strings.ReplaceAll(msg, staff.NormalizeEmail(email), "<manager-email>")
	return strings.ReplaceAll(msg, email, "<manager-email>")
}
