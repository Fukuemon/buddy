package postgres

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	calendarv3 "google.golang.org/api/calendar/v3"

	"github.com/Fukuemon/buddy/services/schedule/db"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendar"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendarexport"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendarsync"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/gcal"
	"github.com/Fukuemon/buddy/services/schedule/internal/gcal/gcaltest"
	"github.com/Fukuemon/buddy/services/schedule/internal/ulid"
)

// このファイルのテストは、書き出しと同期の処理を別のプロセスで並べて動かすときの、Claim とリースの動作を確認する（ADR-0036）。
// 処理ごとに別の接続で取り合うので、ロールバックする txContext ではなく、テストごとに作ったデータベースに書いて確定する。

const workerCalendar = "mori@example.com"

// workerDB は、マイグレーションとシードを適用した、テストのためだけのデータベースの接続のプールを返す。
func workerDB(t *testing.T, name string) *pgxpool.Pool {
	t.Helper()
	cfg := newDatabase(t, name)
	if err := MigrateUp(cfg); err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	if _, err := Seed(ctx, cfg, db.Seed); err != nil {
		t.Fatal(err)
	}
	pool, err := Open(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	return pool
}

// linkMoriCalendar は、森に Google カレンダー workerCalendar を結び付け、そのカレンダーの ID を返す。
func linkMoriCalendar(t *testing.T, pool *pgxpool.Pool) string {
	t.Helper()
	const id = "01M3TD000000000000000000W0"
	err := NewCalendarRepository(pool).Create(context.Background(), calendar.ExternalCalendar{
		ID: id, FacilityID: seedFacility, StaffID: seedMori, Provider: calendar.ProviderGoogle, CalendarID: workerCalendar,
	})
	if err != nil {
		t.Fatal(err)
	}
	return id
}

// enqueueMoriSchedules は、森の単発の予定を n 件作って書き出しの待ちを積み、予定の ID を返す。
func enqueueMoriSchedules(t *testing.T, pool *pgxpool.Pool, n int) []string {
	t.Helper()
	ctx := context.Background()
	exports := NewCalendarExportRepository(pool)
	ids := make([]string, n)
	for i := range n {
		ids[i] = fmt.Sprintf("01M3TD0000000000000000S%03d", i)
		_, err := pool.Exec(ctx, `
			INSERT INTO schedules (id, facility_id, staff_id, schedule_type_id, date, start_time, end_time, title)
			VALUES ($1, $2, $3, $4, '2026-11-04', '10:00', '11:00', $5)`,
			ids[i], seedFacility, seedMori, seedNormalType, fmt.Sprintf("予定 %d", i))
		if err != nil {
			t.Fatal(err)
		}
		if err := exports.Enqueue(ctx, fmt.Sprintf("01M3TD0000000000000000E%03d", i),
			calendar.Target{FacilityID: seedFacility, ScheduleID: ids[i]}); err != nil {
			t.Fatal(err)
		}
	}
	return ids
}

func newWorkerExporter(t *testing.T, pool *pgxpool.Pool, srv *gcaltest.Server, exports calendarexport.ExportRepository, calendars calendarexport.ExporterCalendars) *calendarexport.Exporter {
	t.Helper()
	writer := gcal.NewWriter(gcaltest.Start(t, srv))
	return calendarexport.NewExporter(calendarexport.ExporterDeps{
		Facilities: NewFacilityRepository(pool),
		Exports:    exports, Calendars: calendars,
		Writers:   func(context.Context, string) (calendar.EventWriter, error) { return writer, nil },
		Schedules: NewScheduleRepository(pool), Recurring: NewRecurringScheduleRepository(pool),
	}, ulid.Generator{}, slog.New(slog.NewTextHandler(io.Discard, nil)))
}

func workerServer() *gcaltest.Server {
	return &gcaltest.Server{Calendars: map[string][][]*calendarv3.Event{workerCalendar: {}}}
}

// exportState は、待ち id の状態と、リースが残っているかを返す。
func exportState(t *testing.T, pool *pgxpool.Pool, id string) (status string, attempts int, locked bool) {
	t.Helper()
	err := pool.QueryRow(context.Background(),
		"SELECT status, attempts, locked_until IS NOT NULL AND locked_until > now() FROM calendar_exports WHERE id = $1", id,
	).Scan(&status, &attempts, &locked)
	if err != nil {
		t.Fatal(err)
	}
	return status, attempts, locked
}

// expireLeases は、取った待ちと同期の状態のリースを、切れた後と同じにする。
func expireLeases(t *testing.T, pool *pgxpool.Pool) {
	t.Helper()
	for _, q := range []string{
		"UPDATE calendar_exports SET locked_until = now() - interval '1 second' WHERE locked_until IS NOT NULL",
		"UPDATE calendar_sync_states SET locked_until = now() - interval '1 second' WHERE locked_until IS NOT NULL",
	} {
		if _, err := pool.Exec(context.Background(), q); err != nil {
			t.Fatal(err)
		}
	}
}

// TestCalendarExportRetakesExpiredLease は、取った処理が結果を書かずにリースが切れた待ちを、別の処理が取り直し、
// 前の処理が後から書いた結果を捨てることを確認する。
func TestCalendarExportRetakesExpiredLease(t *testing.T) {
	pool := workerDB(t, "worker_export_lease")
	ctx := context.Background()
	enqueueMoriSchedules(t, pool, 1)
	first, second := NewCalendarExportRepository(pool), NewCalendarExportRepository(pool)

	claimed, err := first.Claim(ctx, 5, time.Minute)
	if err != nil || len(claimed) != 1 {
		t.Fatalf("Claim = %+v, %v", claimed, err)
	}
	if again, err := second.Claim(ctx, 5, time.Minute); err != nil || len(again) != 0 {
		t.Fatalf("リースの間に別の処理が取った: %+v, %v", again, err)
	}
	expireLeases(t, pool)
	retaken, err := second.Claim(ctx, 5, time.Minute)
	if err != nil || len(retaken) != 1 || retaken[0].ID != claimed[0].ID || retaken[0].Attempts != 2 {
		t.Fatalf("リースが切れた後の Claim = %+v, %v", retaken, err)
	}

	if err := first.Finish(ctx, claimed[0], calendar.ExportResult{Status: calendar.ExportSucceeded}); err != nil {
		t.Fatal(err)
	}
	if status, _, locked := exportState(t, pool, claimed[0].ID); status != "pending" || !locked {
		t.Errorf("取り直された後に前の処理が書いた結果を残した: status = %s, locked = %v", status, locked)
	}
	if err := second.Finish(ctx, retaken[0], calendar.ExportResult{Status: calendar.ExportSucceeded}); err != nil {
		t.Fatal(err)
	}
	if status, _, _ := exportState(t, pool, claimed[0].ID); status != "succeeded" {
		t.Errorf("取り直した処理の結果 = %s", status)
	}
}

// TestCalendarSyncRetakesExpiredLease は、取った処理が結果を書かずにリースが切れたカレンダーを、別の処理が取り直し、
// 前の処理が後から書いた結果を捨てることを確認する。
func TestCalendarSyncRetakesExpiredLease(t *testing.T) {
	pool := workerDB(t, "worker_sync_lease")
	ctx := context.Background()
	calID := linkMoriCalendar(t, pool)
	first, second := NewCalendarSyncRepository(pool), NewCalendarSyncRepository(pool)

	claimed, err := first.Claim(ctx, 5, time.Minute, buddyPrimary)
	if err != nil || len(claimed) != 1 || claimed[0].Calendar.ID != calID {
		t.Fatalf("Claim = %+v, %v", claimed, err)
	}
	if again, err := second.Claim(ctx, 5, time.Minute, buddyPrimary); err != nil || len(again) != 0 {
		t.Fatalf("リースの間に別の処理が取った: %+v, %v", again, err)
	}
	expireLeases(t, pool)
	retaken, err := second.Claim(ctx, 5, time.Minute, buddyPrimary)
	if err != nil || len(retaken) != 1 || retaken[0].Calendar.ID != calID {
		t.Fatalf("リースが切れた後の Claim = %+v, %v", retaken, err)
	}

	if err := first.Finish(ctx, claimed[0], calendarsync.SyncResult{SyncToken: "stale", Status: calendarsync.SyncSucceeded}); err != nil {
		t.Fatal(err)
	}
	if err := second.Finish(ctx, retaken[0], calendarsync.SyncResult{SyncToken: "fresh", Status: calendarsync.SyncSucceeded}); err != nil {
		t.Fatal(err)
	}
	var token string
	if err := pool.QueryRow(ctx, "SELECT sync_token FROM calendar_sync_states WHERE external_calendar_id = $1", calID).Scan(&token); err != nil {
		t.Fatal(err)
	}
	if token != "fresh" {
		t.Errorf("同期のトークン = %q, want 取り直した処理の fresh", token)
	}
}

// failOnceLinks は、予定の対応を書く 1 回目だけ失敗する。外部のカレンダーに書いた後に、DB の更新が失敗したときと同じにする。
type failOnceLinks struct {
	*CalendarRepository
	failed atomic.Bool
}

func (f *failOnceLinks) CreateLink(ctx context.Context, l calendar.EventLink) error {
	if f.failed.CompareAndSwap(false, true) {
		return errors.New("DB に繋がらない")
	}
	return f.CalendarRepository.CreateLink(ctx, l)
}

// failOnceFinish は、待ちの結果を書く 1 回目だけ失敗する。書き終えた後に、結果を書けずに処理が止まったときと同じにする。
type failOnceFinish struct {
	*CalendarExportRepository
	failed atomic.Bool
}

func (f *failOnceFinish) Finish(ctx context.Context, e calendar.Export, r calendar.ExportResult) error {
	if f.failed.CompareAndSwap(false, true) {
		return errors.New("DB に繋がらない")
	}
	return f.CalendarExportRepository.Finish(ctx, e, r)
}

// TestCalendarExportDoesNotDuplicateAfterDBFailure は、外部のカレンダーに予定を書いた後に DB の更新が失敗しても、
// 待ちを取り直したときに、同じ予定を 2 つ作らないことを確認する。予定の ID から外部の予定の ID を決め（EventIDOf）、
// 作り直しの 409 を同じ予定とみなすためである。
func TestCalendarExportDoesNotDuplicateAfterDBFailure(t *testing.T) {
	cases := []struct {
		name string
		deps func(pool *pgxpool.Pool) (calendarexport.ExportRepository, calendarexport.ExporterCalendars)
	}{
		{"予定の対応を書けない", func(pool *pgxpool.Pool) (calendarexport.ExportRepository, calendarexport.ExporterCalendars) {
			return NewCalendarExportRepository(pool), &failOnceLinks{CalendarRepository: NewCalendarRepository(pool)}
		}},
		{"待ちの結果を書けない", func(pool *pgxpool.Pool) (calendarexport.ExportRepository, calendarexport.ExporterCalendars) {
			return &failOnceFinish{CalendarExportRepository: NewCalendarExportRepository(pool)}, NewCalendarRepository(pool)
		}},
	}
	for i, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			pool := workerDB(t, fmt.Sprintf("worker_export_db_failure_%d", i))
			ctx := context.Background()
			linkMoriCalendar(t, pool)
			ids := enqueueMoriSchedules(t, pool, 1)
			srv := workerServer()
			exports, calendars := tc.deps(pool)
			// 外部に書いた後に失敗する処理と、後から取り直す別の処理
			if _, err := newWorkerExporter(t, pool, srv, exports, calendars).ExportDue(ctx); err != nil {
				t.Logf("1 回目の ExportDue: %v", err)
			}
			if n := len(srv.Events(workerCalendar)); n != 1 {
				t.Fatalf("1 回目の後の Google の予定の数 = %d", n)
			}
			expireLeases(t, pool)
			if _, err := pool.Exec(ctx, "UPDATE calendar_exports SET next_attempt_at = now()"); err != nil {
				t.Fatal(err)
			}
			retry := newWorkerExporter(t, pool, srv, NewCalendarExportRepository(pool), NewCalendarRepository(pool))
			if n, err := retry.ExportDue(ctx); err != nil || n != 1 {
				t.Fatalf("取り直した ExportDue = %d, %v", n, err)
			}
			if n := len(srv.Events(workerCalendar)); n != 1 {
				t.Errorf("取り直した後の Google の予定の数 = %d, want 1", n)
			}
			if status, _, _ := exportState(t, pool, "01M3TD0000000000000000E000"); status != "succeeded" {
				t.Errorf("待ちの状態 = %s", status)
			}
			l, err := NewCalendarRepository(pool).LinkBySchedule(ctx, ids[0])
			if err != nil || l.ExternalEventID != eventIDOf(t, ids[0]) {
				t.Errorf("予定の対応 = %+v, %v", l, err)
			}
		})
	}
}

func eventIDOf(t *testing.T, id string) string {
	t.Helper()
	ev, err := calendar.EventIDOf(id)
	if err != nil {
		t.Fatal(err)
	}
	return ev
}

// TestCalendarExportersInParallelWriteOnce は、2 つの書き出しの処理が並んで待ちを取っても、同じ待ちを 2 回書かないことを確認する。
func TestCalendarExportersInParallelWriteOnce(t *testing.T) {
	pool := workerDB(t, "worker_export_parallel")
	linkMoriCalendar(t, pool)
	const n = 23
	ids := enqueueMoriSchedules(t, pool, n)
	srv := workerServer()
	var wg sync.WaitGroup
	var claimed atomic.Int64
	for range 2 {
		exporter := newWorkerExporter(t, pool, srv, NewCalendarExportRepository(pool), NewCalendarRepository(pool))
		wg.Go(func() {
			for {
				got, err := exporter.ExportDue(context.Background())
				if err != nil {
					t.Error(err)
					return
				}
				if got == 0 {
					return
				}
				claimed.Add(int64(got))
			}
		})
	}
	wg.Wait()
	if got := claimed.Load(); got != n {
		t.Errorf("2 つの処理が取った待ちの数の和 = %d, want %d", got, n)
	}
	if got := srv.Writes(); got != n {
		t.Errorf("Google への書き込みの数 = %d, want %d", got, n)
	}
	if got := len(srv.Events(workerCalendar)); got != n {
		t.Errorf("Google の予定の数 = %d, want %d", got, n)
	}
	for _, id := range ids {
		if srv.Event(workerCalendar, eventIDOf(t, id)) == nil {
			t.Errorf("予定 %s が書かれていない", id)
		}
	}
}

// TestCalendarSyncersInParallelClaimOnce は、2 つの同期の処理が並んでカレンダーを取っても、同じカレンダーを両方が取らないことを確認する。
func TestCalendarSyncersInParallelClaimOnce(t *testing.T) {
	pool := workerDB(t, "worker_sync_parallel")
	ctx := context.Background()
	calendars := NewCalendarRepository(pool)
	const n = 3
	for i, staffID := range []string{seedMori, seedAoki, seedHayashi}[:n] {
		if err := calendars.Create(ctx, calendar.ExternalCalendar{
			ID: fmt.Sprintf("01M3TD00000000000000000W%02d", i), FacilityID: seedFacility, StaffID: staffID,
			Provider: calendar.ProviderGoogle, CalendarID: fmt.Sprintf("staff%d@example.com", i),
		}); err != nil {
			t.Fatal(err)
		}
	}
	// 同期の状態の行を先に作り、2 つの処理が同じ行を取り合うようにする
	if _, err := NewCalendarSyncRepository(pool).Claim(ctx, 0, time.Minute, buddyPrimary); err != nil {
		t.Fatal(err)
	}
	var mu sync.Mutex
	seen := map[string]int{}
	var wg sync.WaitGroup
	start := make(chan struct{})
	for range 2 {
		r := NewCalendarSyncRepository(pool)
		wg.Go(func() {
			<-start
			for {
				states, err := r.Claim(ctx, 1, time.Minute, buddyPrimary)
				if err != nil {
					t.Error(err)
					return
				}
				if len(states) == 0 {
					return
				}
				mu.Lock()
				for _, st := range states {
					seen[st.Calendar.ID]++
				}
				mu.Unlock()
			}
		})
	}
	close(start)
	wg.Wait()
	if len(seen) != n {
		t.Errorf("取ったカレンダー = %v, want %d 個", seen, n)
	}
	for id, c := range seen {
		if c != 1 {
			t.Errorf("カレンダー %s を %d 回取った", id, c)
		}
	}
}

// TestCalendarExportFinishesAfterShutdown は、停止の合図（ctx の取り消し）の後も、取った待ちの結果を書き、
// リースを残さずに返すことを確認する。次に起動した処理が、リースが切れるのを待たずに取り直せる。
func TestCalendarExportFinishesAfterShutdown(t *testing.T) {
	pool := workerDB(t, "worker_export_shutdown")
	linkMoriCalendar(t, pool)
	enqueueMoriSchedules(t, pool, 1)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	exporter := calendarexport.NewExporter(calendarexport.ExporterDeps{
		Facilities: NewFacilityRepository(pool),
		Exports:    NewCalendarExportRepository(pool), Calendars: NewCalendarRepository(pool),
		// 外部のカレンダーに書こうとしている間に、停止の合図を受ける
		Writers: func(ctx context.Context, _ string) (calendar.EventWriter, error) {
			cancel()
			return nil, ctx.Err()
		},
		Schedules: NewScheduleRepository(pool), Recurring: NewRecurringScheduleRepository(pool),
	}, ulid.Generator{}, slog.New(slog.NewTextHandler(io.Discard, nil)))
	if n, err := exporter.ExportDue(ctx); err != nil || n != 1 {
		t.Fatalf("ExportDue = %d, %v", n, err)
	}
	status, attempts, locked := exportState(t, pool, "01M3TD0000000000000000E000")
	if status != "pending" || attempts != 0 || locked {
		t.Errorf("止めた後の待ち: status = %s, attempts = %d, locked = %v", status, attempts, locked)
	}
	if again, err := NewCalendarExportRepository(pool).Claim(context.Background(), 5, time.Minute); err != nil || len(again) != 1 {
		t.Errorf("止めた後に次の処理が取れない: %+v, %v", again, err)
	}
}

// TestCalendarSyncFinishesAfterShutdown は、停止の合図（ctx の取り消し）の後も、取ったカレンダーの結果を前の状態のまま書き、
// リースを残さずに返すことを確認する。次に起動した処理が、リースが切れるのを待たずに取り直せる。
// 同期が読むのは google_primary の事業所のカレンダーなので、シードの岡田のカレンダーを使う。
func TestCalendarSyncFinishesAfterShutdown(t *testing.T) {
	pool := workerDB(t, "worker_sync_shutdown")
	calID := seedOkadaCalendar
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	syncer := calendarsync.NewSyncer(calendarsync.SyncerDeps{
		Syncs: NewCalendarSyncRepository(pool), Calendars: NewCalendarRepository(pool), Staff: NewStaffRefRepository(pool),
		Locks: NewFacilityRepository(pool),
		// 外部のカレンダーを読もうとしている間に、停止の合図を受ける
		Sources: func(ctx context.Context, _ string) (calendar.EventSource, error) {
			cancel()
			return nil, ctx.Err()
		},
	}, calendarsync.Appliers{
		organization.SourceGooglePrimary: calendarsync.NewProjectionApplier(NewCalendarProjectionRepository(pool), log),
	}, NewTransactor(pool), time.Hour, log)
	if n, err := syncer.SyncDue(ctx); err != nil || n != 2 {
		t.Fatalf("SyncDue = %d, %v", n, err)
	}
	var status string
	var locked bool
	err := pool.QueryRow(context.Background(),
		"SELECT last_status, locked_until IS NOT NULL FROM calendar_sync_states WHERE external_calendar_id = $1", calID,
	).Scan(&status, &locked)
	if err != nil {
		t.Fatal(err)
	}
	if status != string(calendarsync.SyncNever) || locked {
		t.Errorf("止めた後の同期の状態: last_status = %s, locked = %v", status, locked)
	}
	if again, err := NewCalendarSyncRepository(pool).Claim(context.Background(), 5, time.Minute, googlePrimary); err != nil || len(again) != 2 {
		t.Errorf("止めた後に次の処理が取れない: %+v, %v", again, err)
	}
}
