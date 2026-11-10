package main

import (
	"context"
	"errors"
	"log/slog"
	"strings"

	"github.com/Fukuemon/buddy/services/schedule/internal/features/staff"
	"github.com/Fukuemon/buddy/services/schedule/internal/ulid"
)

// 登録の記録の action は、権限の変更の監査の記録（ADR-0042）の操作の種類に合わせる。
const (
	actionFacilityCreate    = "facility.create"
	actionPositionCreate    = "position.create"
	actionStaffCreate       = "staff.create"
	actionStaffCreateForced = "staff.create_forced"
	actorKindOperator       = "operator"
	recordMsg               = "登録の記録"
)

// errOnboardFailed は、onboardFacility が失敗をログに書いた後に返す。呼び出し側はログを重ねて書かない。
var errOnboardFailed = errors.New("onboard failed")

// onboardFacility は、do で登録し、登録の記録を log に JSON で書く。記録は、ADR-0042 の監査の記録の行に合わせ、
// 書いた操作ごとに 1 行を、action、actor_kind、actor_operator、facility_id、対象の ID と、実行ごとの request_id で書く。
// メールと職員の名前は書かない。失敗したときは、メールを伏せた理由を書いてから errOnboardFailed を返す。
func onboardFacility(ctx context.Context, do onboardFunc, a onboardArgs, log *slog.Logger) error {
	log = log.With(
		slog.String("actor_kind", actorKindOperator),
		slog.String("actor_operator", a.Operator),
		slog.String("request_id", ulid.Generator{}.NewID()),
	)
	res, err := do(ctx, a.OnboardInput)
	if err != nil {
		log.Error("事業所と最初のマネージャーを登録できなかった", slog.String("org_id", a.Facility.OrgID),
			slog.String("error", redact(err.Error(), a.Email)))
		return errOnboardFailed
	}
	if a.DryRun {
		// 書かなかったので、記録の行と ID は出さない。確認に要る名前だけを出す
		log.Info("書き込まずに、書く内容を出した",
			slog.Bool("dry_run", true),
			slog.String("org_id", res.Setup.Facility.OrgID),
			slog.Bool("facility_created", res.Setup.FacilityCreated),
			slog.Any("created_positions", res.Setup.CreatedPositions),
			slog.Bool("department_created", res.Setup.DepartmentCreated),
			slog.Bool("team_created", res.Setup.TeamCreated),
			slog.Bool("manager_created", res.ManagerCreated),
			slog.String("facility_name", res.Setup.Facility.Name),
			slog.String("department_name", res.Setup.Department.Name),
			slog.String("team_name", res.Setup.Team.Name),
			slog.String("manager_position_name", res.Setup.ManagerPosition.Name),
		)
		return nil
	}
	fid := slog.String("facility_id", res.Setup.Facility.ID)
	if !res.ManagerCreated {
		log.Info("同じメールの職員が登録済みで、何も書かなかった", fid, slog.String("staff_id", res.Manager.ID))
		return nil
	}
	if res.Setup.FacilityCreated {
		log.Info(recordMsg, slog.String("action", actionFacilityCreate), fid)
		for _, p := range res.Setup.Positions {
			log.Info(recordMsg, slog.String("action", actionPositionCreate), fid, slog.String("target_position_id", p.ID))
		}
	}
	// 事業所を作らなかった実行でマネージャーを足せるのは、明示のフラグを付けたときだけである
	action := actionStaffCreate
	if !res.Setup.FacilityCreated {
		action = actionStaffCreateForced
	}
	log.Info(recordMsg, slog.String("action", action), fid, slog.String("target_user_id", res.Manager.ID))
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
