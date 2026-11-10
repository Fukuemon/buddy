package main

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/Fukuemon/buddy/services/schedule/internal/broker"
	"github.com/Fukuemon/buddy/services/schedule/internal/config"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/staff"
	"github.com/Fukuemon/buddy/services/schedule/internal/postgres"
	"github.com/Fukuemon/buddy/services/schedule/internal/ulid"
)

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
