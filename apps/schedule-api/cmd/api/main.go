// Command api は、予定の API の HTTP サーバーを起動する。SIGINT か SIGTERM を受けると、
// 処理中のリクエストを最大 30 秒待ってから止まる。設定は internal/config の Load が読む環境変数である。
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

	"github.com/Fukuemon/buddy/apps/schedule-api/internal/config"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/infrastructure/mysql"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/infrastructure/ulid"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/presentation/http/handler"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/usecase"
)

const shutdownTimeout = 30 * time.Second

func main() {
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

	tx := mysql.NewTransactor(db)
	ids := ulid.Generator{}
	facilities := mysql.NewFacilityRepository(db)
	departments := mysql.NewDepartmentRepository(db)
	teams := mysql.NewTeamRepository(db)
	positions := mysql.NewPositionRepository(db)
	policies := mysql.NewPolicyRepository(db)
	staff := mysql.NewStaffRepository(db)
	patients := mysql.NewPatientRepository(db)
	visits := mysql.NewVisitRepository(db)
	schedules := mysql.NewScheduleRepository(db)

	router := handler.NewRouter(handler.Usecases{
		Organization: usecase.NewOrganization(usecase.OrganizationRepositories{
			Facilities: facilities, Departments: departments, Teams: teams, Positions: positions, Policies: policies,
		}, tx, ids),
		Staff: usecase.NewStaff(usecase.StaffRepositories{
			Facilities: facilities, Departments: departments, Teams: teams, Positions: positions, Staff: staff,
		}, tx, ids),
		Patients: usecase.NewPatients(usecase.PatientRepositories{
			Facilities: facilities, Staff: staff, Visits: visits, Patients: patients,
		}, ids),
		VisitMasters: usecase.NewVisitMasters(visits),
		Schedules: usecase.NewSchedules(usecase.ScheduleRepositories{
			Facilities: facilities, Staff: staff, Patients: patients, Visits: visits, Schedules: schedules,
		}, tx, ids),
	}, handler.RouterConfig{Logger: log, AllowOrigins: cfg.AllowOrigins})

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
