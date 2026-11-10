package main

import (
	"context"
	"errors"
	"log/slog"
	"strings"

	"github.com/Fukuemon/buddy/services/schedule/internal/features/staff"
	"github.com/Fukuemon/buddy/services/schedule/internal/ulid"
)

// operationOnboardFacility は、登録の記録の操作の種類である。
const operationOnboardFacility = "facility.onboard"

// errOnboardFailed は、onboardFacility が失敗をログに書いた後に返す。呼び出し側はログを重ねて書かない。
var errOnboardFailed = errors.New("onboard failed")

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
	msg := "事業所と最初のマネージャーを登録した"
	if !res.ManagerCreated {
		msg = "マネージャーは登録済みで、何も書かなかった"
	}
	log.Info(msg, append(attrs,
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
