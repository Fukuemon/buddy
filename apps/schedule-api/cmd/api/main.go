// Command api は、予定の API の HTTP サーバーを起動する。SIGINT か SIGTERM を受けると、
// 処理中のリクエストを最大 30 秒待ってから止まる。設定は internal/config の Load が読む環境変数である。
// `api healthcheck` は、サーバーを起動せず、動いているサーバーの GET /readyz を確かめて終わる。
package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"golang.org/x/oauth2/google"
	calendarv3 "google.golang.org/api/calendar/v3"
	"google.golang.org/api/option"

	"github.com/Fukuemon/buddy/packages/go/healthcheck"

	"github.com/Fukuemon/buddy/packages/go/oidc"

	"github.com/Fukuemon/buddy/apps/schedule-api/internal/access"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/calendar"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/config"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/gcal"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/httpapi"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/organization"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/patient"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/postgres"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/principal"
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
		os.Exit(healthcheck.Run())
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

	db, err := postgres.Open(ctx, postgres.Config(cfg.DB))
	if err != nil {
		return err
	}
	defer db.Close()

	verifier, err := oidc.NewVerifier(ctx, cfg.OIDC, nil, log)
	if err != nil {
		return err
	}

	svc, err := newCalendarService(ctx, cfg.Calendar)
	if err != nil {
		return err
	}
	var source calendar.EventSource
	if svc != nil {
		source = gcal.NewReader(svc)
	}

	tx := postgres.NewTransactor(db)
	ids := ulid.Generator{}
	facilities := postgres.NewFacilityRepository(db)
	departments := postgres.NewDepartmentRepository(db)
	teams := postgres.NewTeamRepository(db)
	positions := postgres.NewPositionRepository(db)
	policies := postgres.NewPolicyRepository(db)
	staffRepo := postgres.NewStaffRepository(db)
	staffRefs := postgres.NewStaffRefRepository(db)
	patients := postgres.NewPatientRepository(db)
	visitMasters := postgres.NewVisitMasterRepository(db)
	schedules := postgres.NewScheduleRepository(db)
	recurring := postgres.NewRecurringScheduleRepository(db)
	scheduleTypes := postgres.NewScheduleTypeRepository(db)
	calendars := postgres.NewCalendarRepository(db)
	exports := postgres.NewCalendarExportRepository(db)
	// 書き出しを有効にしていなければ、予定の変更を書き出しの待ちに積まない
	var outbox schedule.Exports
	if cfg.Calendar.ExportEnabled {
		outbox = calendar.NewOutbox(exports, calendars, ids)
	}
	visitInfos := visit.NewWriter(visit.WriterDeps{
		Staff: staffRefs,
		Patients: func(ctx context.Context, id string) (string, string, error) {
			pa, err := patients.Get(ctx, id)
			return pa.ID, pa.FacilityID, err
		},
		Infos:   postgres.NewVisitInfoRepository(db),
		Masters: visitMasters,
	}, ids)

	router := httpapi.NewRouter(httpapi.Usecases{
		Organization: organization.NewUsecase(organization.Deps{
			Facilities: facilities, Departments: departments, Teams: teams, Positions: positions, Policies: policies,
		}, tx, ids, principal.RequireStaffManage),
		Staff: staff.NewUsecase(staff.Deps{
			Facilities: facilities, Departments: departments, Teams: teams, Positions: positions, Policies: policies, Staff: staffRepo,
		}, tx, ids, principal.RequireStaffManage),
		Patients: patient.NewUsecase(patient.Deps{
			Facilities: facilities, Staff: staffRefs, ServiceCodes: visitMasters, Patients: patients,
		}, ids, principal.RequireStaffManage),
		VisitMasters: visit.NewUsecase(visitMasters),
		Schedules: schedule.NewUsecase(schedule.Deps{
			Facilities: facilities, Staff: staffRefs, Visits: visitInfos,
			Schedules: schedules, Recurring: recurring, Types: scheduleTypes,
			Exports: outbox,
		}, tx, ids),
		Calendars: calendar.NewUsecase(calendar.Deps{
			Calendars: calendars, Source: source, ServiceAccount: cfg.Calendar.ServiceAccount,
			Staff: staffRefs, Patients: patients, ServiceCodes: visitMasters, Types: scheduleTypes,
			Schedules: schedules, Recurring: recurring, RecurringSchedules: recurring, Visits: visitInfos,
			Exports: exports,
		}, tx, ids, principal.RequireStaffManage),
		Auth: access.NewService(access.Deps{
			Facilities: facilities, Departments: departments, Teams: teams, Positions: positions,
			Staff: staffRepo, StaffRefs: staffRefs, Schedules: schedules, Recurring: recurring, Calendars: calendars,
			Exports: exports,
		}),
	}, httpapi.RouterConfig{Logger: log, AllowOrigins: cfg.AllowOrigins, Verifier: tokenVerifier{verifier}, Ready: func(ctx context.Context) error {
		ctx, cancel := context.WithTimeout(ctx, readyTimeout)
		defer cancel()
		return db.Ping(ctx)
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

	// 書き出しと同期の処理は、止まる合図の後、取った待ちとカレンダーの結果を書いてから止まる。DB を閉じる前に止めて待つ。
	exporterDone, syncerDone := make(chan struct{}), make(chan struct{})
	if svc != nil && cfg.Calendar.ExportEnabled {
		exporter := calendar.NewExporter(calendar.ExporterDeps{
			Exports: exports, Calendars: calendars, Writer: gcal.NewWriter(svc), Schedules: schedules, Recurring: recurring,
		}, ids, log)
		go func() {
			defer close(exporterDone)
			exporter.Run(ctx, cfg.Calendar.ExportInterval)
		}()
	} else {
		close(exporterDone)
	}
	if svc != nil && cfg.Calendar.SyncEnabled {
		syncer := calendar.NewSyncer(calendar.SyncerDeps{
			Syncs: postgres.NewCalendarSyncRepository(db), Calendars: calendars, Exports: exports, Source: source,
			Schedules: schedules, Recurring: recurring, Types: scheduleTypes, Patients: patients, ServiceCodes: visitMasters, Visits: visitInfos,
		}, tx, ids, cfg.Calendar.SyncInterval, log)
		go func() {
			defer close(syncerDone)
			syncer.Run(ctx, cfg.Calendar.SyncInterval)
		}()
	} else {
		close(syncerDone)
	}
	defer func() {
		stop()
		<-exporterDone
		<-syncerDone
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

// newCalendarService は、Google カレンダーの予定を読み書きする calendarv3.Service を返す。サービスアカウントの設定が無ければ nil を返す。
// 認証の情報は、照合の API と同じく Application Default Credentials で読む。偽物の API に向けるときは認証をしない。
// 予定を書き出すときは、スコープを calendar.events にする。書き出さないときは、読むだけの calendar.readonly にする。
func newCalendarService(ctx context.Context, cfg config.Calendar) (*calendarv3.Service, error) {
	if cfg.ServiceAccount == "" {
		return nil, nil
	}
	var opts []option.ClientOption
	if cfg.Endpoint != "" {
		opts = append(opts, option.WithEndpoint(cfg.Endpoint), option.WithoutAuthentication())
	} else {
		scope := calendarv3.CalendarReadonlyScope
		if cfg.ExportEnabled {
			scope = calendarv3.CalendarEventsScope
		}
		creds, err := google.FindDefaultCredentials(ctx, scope)
		if err != nil {
			return nil, fmt.Errorf("application default credentials を読めません: %w", err)
		}
		opts = append(opts, option.WithCredentials(creds))
	}
	return calendarv3.NewService(ctx, opts...)
}

// tokenVerifier は、共有の oidc.Verifier を httpapi.TokenVerifier にする。httpapi は oidc を import しないので、主張の型をここで写す。
type tokenVerifier struct{ v *oidc.Verifier }

// Verify は、トークンを検証し、主張を principal.Identity にして返す。
func (t tokenVerifier) Verify(ctx context.Context, raw string) (principal.Identity, error) {
	id, err := t.v.Verify(ctx, raw)
	return principal.Identity(id), err
}
