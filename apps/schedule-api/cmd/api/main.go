// Command api は、予定の API の HTTP サーバーを起動する。SIGINT か SIGTERM を受けると、
// 処理中のリクエストを最大 30 秒待ってから止まる。設定は internal/config の Load が読む環境変数である。
// `api healthcheck` は、サーバーを起動せず、動いているサーバーの GET /readyz を確かめて終わる。
package main

import (
	"context"
	"errors"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/Fukuemon/buddy/apps/schedule-api/internal/access"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/auth"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/config"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/httpapi"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/mysql"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/oidc"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/organization"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/patient"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/schedule"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/staff"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/ulid"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/visit"
)

const (
	shutdownTimeout = 30 * time.Second
	readyTimeout    = 2 * time.Second
)

func main() {
	if len(os.Args) > 1 && os.Args[1] == "healthcheck" {
		os.Exit(healthcheck())
	}
	if err := run(); err != nil {
		slog.Error("api stopped", slog.Any("error", err))
		os.Exit(1)
	}
}

func run() error {
	cfg, err := config.Load(os.Getenv)
	if err != nil {
		return err
	}
	log := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: cfg.LogLevel}))

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	db, err := mysql.Open(ctx, cfg.DB)
	if err != nil {
		return err
	}
	defer func() {
		if err := db.Close(); err != nil {
			log.Error("close db", slog.Any("error", err))
		}
	}()

	verifier, err := oidc.NewVerifier(ctx, cfg.OIDC, nil, log)
	if err != nil {
		return err
	}

	tx := mysql.NewTransactor(db)
	ids := ulid.Generator{}
	facilities := mysql.NewFacilityRepository(db)
	departments := mysql.NewDepartmentRepository(db)
	teams := mysql.NewTeamRepository(db)
	positions := mysql.NewPositionRepository(db)
	policies := mysql.NewPolicyRepository(db)
	staffRepo := mysql.NewStaffRepository(db)
	patients := mysql.NewPatientRepository(db)
	visits := mysql.NewVisitRepository(db)
	schedules := mysql.NewScheduleRepository(db)

	router := httpapi.NewRouter(httpapi.Usecases{
		Organization: organization.NewService(organization.Repositories{
			Facilities: facilities, Departments: departments, Teams: teams, Positions: positions, Policies: policies,
		}, tx, ids),
		Staff: staff.NewService(staff.Repositories{
			Facilities: facilities, Departments: departments, Teams: teams, Positions: positions, Policies: policies, Staff: staffRepo,
		}, tx, ids, auth.RequireStaffManage),
		Patients: patient.NewService(patient.Repositories{
			Facilities: facilities, Staff: staffRepo, Visits: visits, Patients: patients,
		}, ids),
		VisitMasters: visit.NewService(visits),
		Schedules: schedule.NewService(schedule.Repositories{
			Facilities: facilities, Staff: staffRepo, Patients: patients, Visits: visits, Schedules: schedules,
		}, tx, ids),
		Auth: access.NewService(access.Repositories{
			Facilities: facilities, Departments: departments, Teams: teams, Positions: positions,
			Staff: staffRepo, Schedules: schedules,
		}),
	}, httpapi.RouterConfig{Logger: log, AllowOrigins: cfg.AllowOrigins, Verifier: verifier, Ready: func(ctx context.Context) error {
		ctx, cancel := context.WithTimeout(ctx, readyTimeout)
		defer cancel()
		return db.PingContext(ctx)
	}})

	srv := &http.Server{
		Addr:              net.JoinHostPort("", cfg.Port),
		Handler:           router,
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
	}
	serveErr := make(chan error, 1)
	go func() {
		log.Info("listening", slog.String("addr", srv.Addr))
		serveErr <- srv.ListenAndServe()
	}()

	select {
	case err := <-serveErr:
		return err
	case <-ctx.Done():
	}
	log.Info("shutting down")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		return err
	}
	if err := <-serveErr; !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	return nil
}
