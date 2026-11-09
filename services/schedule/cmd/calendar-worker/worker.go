package main

import (
	"context"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/Fukuemon/buddy/services/schedule/internal/config"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendarexport"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendarsync"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/visit"
	"github.com/Fukuemon/buddy/services/schedule/internal/gcal"
	"github.com/Fukuemon/buddy/services/schedule/internal/postgres"
	"github.com/Fukuemon/buddy/services/schedule/internal/ulid"
)

// openAccounts は、事業所の組織のサービスアカウントで Google カレンダーを読み書きする gcal.Accounts を返す。
// 書き出しを有効にした設定なら、スコープを calendar.events にする。サービスアカウントの設定が無ければ nil を返す。
func openAccounts(ctx context.Context, cfg config.Calendar, db *pgxpool.Pool) (*gcal.Accounts, error) {
	facilities := postgres.NewFacilityRepository(db)
	return gcal.Open(ctx, gcal.Config{ServiceAccountsFile: cfg.ServiceAccountsFile, Endpoint: cfg.Endpoint, Writable: cfg.ExportEnabled},
		func(ctx context.Context, facilityID string) (string, error) {
			f, err := facilities.Get(ctx, facilityID)
			return f.OrgID, err
		})
}

// newExporter は、書き出しの待ちの予定を accounts の Google カレンダーに書く Exporter を作る。accounts は nil にしない。
// 書き出しを有効にした設定（config.Calendar の ExportEnabled）のときだけ作って動かす。
func newExporter(db *pgxpool.Pool, accounts *gcal.Accounts, log *slog.Logger) *calendarexport.Exporter {
	schedules := postgres.NewScheduleRepository(db)
	return calendarexport.NewExporter(calendarexport.ExporterDeps{
		Facilities: postgres.NewFacilityRepository(db), Exports: postgres.NewCalendarExportRepository(db), Calendars: postgres.NewCalendarRepository(db),
		Writers: accounts.Writer, Schedules: schedules, Recurring: postgres.NewRecurringScheduleRepository(db), Deletions: schedules,
	}, ulid.Generator{}, log)
}

// newSyncer は、accounts の Google カレンダーの変更を interval ごとに読む Syncer を作る。
// Google カレンダーを予定の正本にする事業所（google_primary）のカレンダーの変更を、ProjectionApplier で予定の写し（Projection）に写す。
// buddy を予定の正本にする事業所（buddy_primary）の Applier は渡さないので、そのカレンダーは読まない（ADR-0029）。
// 同期と読み戻しは、予定の API が Google に書いた予定の保留の版を、記録（records）で確定するか消す。
// accounts は nil にしない。同期を有効にした設定（config.Calendar の SyncEnabled）のときだけ作って動かす。
func newSyncer(db *pgxpool.Pool, accounts *gcal.Accounts, interval time.Duration, log *slog.Logger) *calendarsync.Syncer {
	staffRefs := postgres.NewStaffRefRepository(db)
	records := postgres.NewCalendarEventRecordRepository(db)
	visits := visit.NewWriter(visit.WriterDeps{
		Staff:        staffRefs,
		Patients:     postgres.NewPatientRepository(db),
		Infos:        postgres.NewVisitInfoRepository(db),
		ServiceCodes: postgres.NewServiceCodeRepository(db),
		Categories:   postgres.NewVisitCategoryRepository(db),
	}, ulid.Generator{})
	return calendarsync.NewSyncer(calendarsync.SyncerDeps{
		Syncs: postgres.NewCalendarSyncRepository(db), Calendars: postgres.NewCalendarRepository(db), Staff: staffRefs,
		Locks: postgres.NewFacilityRepository(db), Sources: accounts.Source, Records: records, Visits: visits,
	}, calendarsync.Appliers{
		organization.SourceGooglePrimary: calendarsync.NewProjectionApplier(postgres.NewCalendarProjectionRepository(db), records, visits, log),
	}, postgres.NewTransactor(db), interval, log)
}
