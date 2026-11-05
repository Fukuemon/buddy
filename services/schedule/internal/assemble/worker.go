package assemble

import (
	"log/slog"
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendarexport"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendarsync"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/gcal"
)

// NewExporter は、書き出しの待ちの予定を accounts の Google カレンダーに書く Exporter を作る。accounts は nil にしない。
// cmd/calendar-worker が、書き出しを有効にした設定（config.Calendar の ExportEnabled）のときだけ作って動かす。
func NewExporter(r Repositories, accounts *gcal.Accounts, log *slog.Logger) *calendarexport.Exporter {
	return calendarexport.NewExporter(calendarexport.ExporterDeps{
		Facilities: r.facilities, Exports: r.exports, Calendars: r.calendars, Writers: accounts.Writer, Schedules: r.schedules, Recurring: r.recurring,
	}, r.ids, log)
}

// NewSyncer は、accounts の Google カレンダーの変更を interval ごとに読む Syncer を作る。
// Google カレンダーを予定の正本にする事業所（google_primary）のカレンダーの変更を、ProjectionApplier で予定の写し（Projection）に写す。
// buddy を予定の正本にする事業所（buddy_primary）の Applier は渡さないので、そのカレンダーは読まない（ADR-0026）。
// accounts は nil にしない。cmd/calendar-worker が、同期を有効にした設定（config.Calendar の SyncEnabled）のときだけ作って動かす。
func NewSyncer(r Repositories, accounts *gcal.Accounts, interval time.Duration, log *slog.Logger) *calendarsync.Syncer {
	return calendarsync.NewSyncer(calendarsync.SyncerDeps{
		Syncs: r.calendarSyncs, Calendars: r.calendars, Staff: r.staffRefs, Locks: r.facilities, Sources: accounts.Source,
	}, calendarsync.Appliers{
		organization.SourceGooglePrimary: calendarsync.NewProjectionApplier(r.projections, log),
	}, r.tx, interval, log)
}
