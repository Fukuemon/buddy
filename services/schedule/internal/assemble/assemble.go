// Package assemble は、予定の API の実行の単位が使う値を、アダプタと機能のパッケージから組み立てる。
// 全ての機能とアダプタを import してよいのは、このパッケージだけである。cmd はこのパッケージの関数を呼び、
// 作った値で、cmd/api はサーバーを、cmd/calendar-worker は書き出しか同期の処理を起動する。
package assemble

import (
	"context"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	calendarv3 "google.golang.org/api/calendar/v3"

	"github.com/Fukuemon/buddy/packages/go/gcalauth"

	"github.com/Fukuemon/buddy/services/schedule/internal/config"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendarexport"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendarsync"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/visit"
	"github.com/Fukuemon/buddy/services/schedule/internal/gcal"
	"github.com/Fukuemon/buddy/services/schedule/internal/postgres"
	"github.com/Fukuemon/buddy/services/schedule/internal/ulid"
)

// OpenDB は、cfg の DB への接続のプールを作り、疎通を確認して返す。返したプールは呼び出し側が閉じる。
func OpenDB(ctx context.Context, cfg config.DB) (*pgxpool.Pool, error) {
	return postgres.Open(ctx, postgres.Config(cfg))
}

// Repositories は、1 つの接続のプールの上のリポジトリ、トランザクション、ID の発行である。
// NewRepositories で作り、NewCalendarAccounts、NewHandler、NewExporter、NewSyncer に同じ値を渡す。
type Repositories struct {
	tx               *postgres.Transactor
	ids              ulid.Generator
	facilities       *postgres.FacilityRepository
	departments      *postgres.DepartmentRepository
	teams            *postgres.TeamRepository
	positions        *postgres.PositionRepository
	policies         *postgres.PolicyRepository
	staff            *postgres.StaffRepository
	staffRefs        *postgres.StaffRefRepository
	staffAssignments *postgres.StaffAssignmentReader
	patients         *postgres.PatientRepository
	patientSchedules *postgres.PatientScheduleReader
	visitInfos       *postgres.VisitInfoRepository
	serviceCodes     *postgres.ServiceCodeRepository
	visitCategories  *postgres.VisitCategoryRepository
	schedules        *postgres.ScheduleRepository
	recurring        *postgres.RecurringScheduleRepository
	scheduleTypes    *postgres.ScheduleTypeRepository
	calendars        *postgres.CalendarRepository
	exports          *postgres.CalendarExportRepository
	calendarSyncs    *postgres.CalendarSyncRepository
	projections      *postgres.CalendarProjectionRepository
}

// NewRepositories は、db の上に Repositories を作る。db に接続せず、失敗しない。
func NewRepositories(db *pgxpool.Pool) Repositories {
	return Repositories{
		tx:               postgres.NewTransactor(db),
		ids:              ulid.Generator{},
		facilities:       postgres.NewFacilityRepository(db),
		departments:      postgres.NewDepartmentRepository(db),
		teams:            postgres.NewTeamRepository(db),
		positions:        postgres.NewPositionRepository(db),
		policies:         postgres.NewPolicyRepository(db),
		staff:            postgres.NewStaffRepository(db),
		staffRefs:        postgres.NewStaffRefRepository(db),
		staffAssignments: postgres.NewStaffAssignmentReader(db),
		patients:         postgres.NewPatientRepository(db),
		patientSchedules: postgres.NewPatientScheduleReader(db),
		visitInfos:       postgres.NewVisitInfoRepository(db),
		serviceCodes:     postgres.NewServiceCodeRepository(db),
		visitCategories:  postgres.NewVisitCategoryRepository(db),
		schedules:        postgres.NewScheduleRepository(db),
		recurring:        postgres.NewRecurringScheduleRepository(db),
		scheduleTypes:    postgres.NewScheduleTypeRepository(db),
		calendars:        postgres.NewCalendarRepository(db),
		exports:          postgres.NewCalendarExportRepository(db),
		calendarSyncs:    postgres.NewCalendarSyncRepository(db),
		projections:      postgres.NewCalendarProjectionRepository(db),
	}
}

func (r Repositories) visitWriter() visit.Writer {
	return visit.NewWriter(visit.WriterDeps{
		Staff:        r.staffRefs,
		Patients:     r.patients,
		Infos:        r.visitInfos,
		ServiceCodes: r.serviceCodes,
		Categories:   r.visitCategories,
	}, r.ids)
}

// NewCalendarAccounts は、事業所の組織のサービスアカウントで Google カレンダーを読み書きする gcal.Accounts を返す。
// cmd/api は NewHandler のカレンダーの操作に、cmd/calendar-worker は NewExporter と NewSyncer に渡す。
// サービスアカウントの設定が無ければ nil を返す。認証は Application Default Credentials で読み、事業所のアカウントになりすます。
// ローカル環境の calendarpit に向けるときは、GOOGLE_APPLICATION_CREDENTIALS の認証情報をなりすまさずに使い、無ければ認証をしない。
// 予定を書き出すときは、スコープを calendar.events にする。書き出さないときは、読むだけの calendar.readonly にする。
// サービスアカウントの対応のファイルを読めないとき、認証の情報を作れないときは、エラーを返す。
func NewCalendarAccounts(ctx context.Context, cfg config.Calendar, r Repositories) (*gcal.Accounts, error) {
	if cfg.ServiceAccountsFile == "" {
		return nil, nil
	}
	accounts, err := gcalauth.LoadAccounts(cfg.ServiceAccountsFile)
	if err != nil {
		return nil, err
	}
	scope := calendarv3.CalendarReadonlyScope
	if cfg.ExportEnabled {
		scope = calendarv3.CalendarEventsScope
	}
	clients, err := gcalauth.New(ctx, gcalauth.Config{Accounts: accounts, Scope: scope, Endpoint: cfg.Endpoint})
	if err != nil {
		return nil, err
	}
	return gcal.NewAccounts(clients, func(ctx context.Context, facilityID string) (string, error) {
		f, err := r.facilities.Get(ctx, facilityID)
		return f.OrgID, err
	}), nil
}

// NewExporter は、書き出しの待ちの予定を accounts の Google カレンダーに書く Exporter を作る。accounts は nil にしない。
// cmd/calendar-worker が、書き出しを有効にした設定（config.Calendar の ExportEnabled）のときだけ作って動かす。
func NewExporter(r Repositories, accounts *gcal.Accounts, log *slog.Logger) *calendarexport.Exporter {
	return calendarexport.NewExporter(calendarexport.ExporterDeps{
		Facilities: r.facilities, Exports: r.exports, Calendars: r.calendars, Writers: accounts.Writer, Schedules: r.schedules, Recurring: r.recurring,
	}, r.ids, log)
}

// NewSyncer は、accounts の Google カレンダーの変更を interval ごとに読む Syncer を作る。
// Google カレンダーを予定の正本にする事業所（google_primary）のカレンダーの変更を、ProjectionApplier で予定の写し（Projection）に写す。
// buddy を予定の正本にする事業所（buddy_primary）の Applier は渡さないので、そのカレンダーは読まない（ADR-0035）。
// accounts は nil にしない。cmd/calendar-worker が、同期を有効にした設定（config.Calendar の SyncEnabled）のときだけ作って動かす。
func NewSyncer(r Repositories, accounts *gcal.Accounts, interval time.Duration, log *slog.Logger) *calendarsync.Syncer {
	return calendarsync.NewSyncer(calendarsync.SyncerDeps{
		Syncs: r.calendarSyncs, Calendars: r.calendars, Staff: r.staffRefs, Locks: r.facilities, Sources: accounts.Source,
	}, calendarsync.Appliers{
		organization.SourceGooglePrimary: calendarsync.NewProjectionApplier(r.projections, log),
	}, r.tx, interval, log)
}
