package main

import (
	"context"
	"io"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	tcpostgres "github.com/testcontainers/testcontainers-go/modules/postgres"
	calendarv3 "google.golang.org/api/calendar/v3"

	"github.com/Fukuemon/buddy/services/schedule/db"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendar"
	"github.com/Fukuemon/buddy/services/schedule/internal/gcal/gcaltest"
	"github.com/Fukuemon/buddy/services/schedule/internal/postgres"
)

func env(m map[string]string) func(string) string {
	return func(k string) string { return m[k] }
}

func TestRunRejectsArgs(t *testing.T) {
	for _, args := range [][]string{
		nil,
		{"import"},
		{"export", "extra"},
		{"export", "--max-duration", "1m"},
		{"sync", "--once", "--max-duration", "-1s"},
		{"sync", "--unknown"},
	} {
		if code := run(t.Context(), args, env(nil), io.Discard, io.Discard); code != 2 {
			t.Errorf("run(%q) = %d, want 2", args, code)
		}
	}
}

func TestRunConfigError(t *testing.T) {
	if code := run(t.Context(), []string{"export", "--once"}, env(nil), io.Discard, io.Discard); code != 1 {
		t.Errorf("DB の設定が無い run = %d, want 1", code)
	}
}

// TestRunDisabledRole は、フラグが無効の役割は DB に繋がずに 0 で終わることを確認する。DB_HOST は繋がらない名前にする。
func TestRunDisabledRole(t *testing.T) {
	getenv := env(map[string]string{"DB_HOST": "invalid.invalid", "DB_USER": "u", "DB_PASSWORD": "p", "DB_NAME": "n"})
	for _, r := range []string{"export", "sync"} {
		if code := run(t.Context(), []string{r, "--once"}, getenv, io.Discard, io.Discard); code != 0 {
			t.Errorf("無効な %s の run = %d, want 0", r, code)
		}
	}
}

const (
	seedFacility   = "01M3TC5H00QV17BC0J9V3393ZP"
	seedAoki       = "01M3TC5TRG5200KYWTZW6ER3WN"
	seedConference = "01M3TC6BBRBQM0QK0S43P56AFH"
	aokiCalendar   = "aoki@example.com"
	// okadaCalendar と okadaCalendarID は、シードの google_primary の事業所の岡田に結び付けたカレンダーである。
	okadaCalendar   = "aoi.okada@example.com"
	okadaCalendarID = "01MA0GP0000000000000000GCA"
	exportID        = "01M3TD000000000000000000X0"
	calendarID      = "01M3TD000000000000000000C0"
)

// TestRunOnce は、export --once と sync --once が、取れるものを処理して 0 で終わることを確認する。
// sync --once は、google_primary の事業所のカレンダーの予定を Projection に写し、buddy_primary の事業所のカレンダーを読まない（ADR-0035）。
func TestRunOnce(t *testing.T) {
	if testing.Short() {
		t.Skip("PostgreSQL を使うテストは -short では動かさない")
	}
	ctx := t.Context()
	cfg, pool := startPostgres(t)
	if err := postgres.NewCalendarRepository(pool).Create(ctx, calendar.ExternalCalendar{
		ID: calendarID, FacilityID: seedFacility, StaffID: seedAoki, Provider: calendar.ProviderGoogle, CalendarID: aokiCalendar,
	}); err != nil {
		t.Fatal(err)
	}
	if err := postgres.NewCalendarExportRepository(pool).Enqueue(ctx, exportID, calendar.Target{FacilityID: seedFacility, ScheduleID: seedConference}); err != nil {
		t.Fatal(err)
	}
	srv := &gcaltest.Server{Calendars: map[string][][]*calendarv3.Event{aokiCalendar: {}, okadaCalendar: {{{
		Id: "visit", Status: "confirmed", Summary: "【訪看I2】見本 一郎", Etag: `"visit"`,
		Start: &calendarv3.EventDateTime{DateTime: "2099-11-04T10:00:00+09:00"}, End: &calendarv3.EventDateTime{DateTime: "2099-11-04T10:30:00+09:00"},
	}}}}}
	ts := httptest.NewServer(srv.Handler())
	t.Cleanup(ts.Close)
	accounts := filepath.Join(t.TempDir(), "accounts.json")
	if err := os.WriteFile(accounts, []byte(`[{"org_id": "org-sample", "service_account": "buddy@example.iam.gserviceaccount.com"}, {"org_id": "org-sample-c", "service_account": "buddy-c@example.iam.gserviceaccount.com"}]`), 0o600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("GOOGLE_APPLICATION_CREDENTIALS", "")
	getenv := env(map[string]string{
		"DB_HOST": cfg.Host, "DB_PORT": cfg.Port, "DB_USER": cfg.User, "DB_PASSWORD": cfg.Password, "DB_NAME": cfg.Name, "DB_MAX_CONNS": "2",
		"GOOGLE_CALENDAR_SERVICE_ACCOUNTS_FILE": accounts, "GOOGLE_CALENDAR_ENDPOINT": ts.URL + "/",
		"GOOGLE_CALENDAR_EXPORT_ENABLED": "true", "GOOGLE_CALENDAR_SYNC_ENABLED": "true",
	})

	if code := run(ctx, []string{"export", "--once", "--max-duration", "1m"}, getenv, io.Discard, io.Discard); code != 0 {
		t.Fatalf("export --once = %d, want 0", code)
	}
	var status string
	if err := pool.QueryRow(ctx, "SELECT status FROM calendar_exports WHERE id = $1", exportID).Scan(&status); err != nil {
		t.Fatal(err)
	}
	eventID, err := calendar.EventIDOf(seedConference)
	if err != nil {
		t.Fatal(err)
	}
	if status != "succeeded" || srv.Event(aokiCalendar, eventID) == nil {
		t.Errorf("書き出した後: 待ちの状態 = %s, Google の予定 = %v", status, srv.Event(aokiCalendar, eventID))
	}

	if code := run(ctx, []string{"sync", "--once"}, getenv, io.Discard, io.Discard); code != 0 {
		t.Fatalf("sync --once = %d, want 0", code)
	}
	syncStatus := func(id string) string {
		t.Helper()
		var s string
		if err := pool.QueryRow(ctx, "SELECT last_status FROM calendar_sync_states WHERE external_calendar_id = $1", id).Scan(&s); err != nil {
			t.Fatal(err)
		}
		return s
	}
	if got := syncStatus(okadaCalendarID); got != "succeeded" {
		t.Errorf("google_primary のカレンダーの同期した後の状態 = %s", got)
	}
	if got := syncStatus(calendarID); got != "never" {
		t.Errorf("buddy_primary のカレンダーの同期の状態 = %s, want 読まずに never", got)
	}
	var projected int
	if err := pool.QueryRow(ctx, "SELECT count(*) FROM calendar_event_projections WHERE external_calendar_id = $1 AND external_event_id = 'visit'",
		okadaCalendarID).Scan(&projected); err != nil {
		t.Fatal(err)
	}
	if projected != 1 {
		t.Errorf("Projection に写した予定の行 = %d, want 1", projected)
	}
}

// startPostgres は、PostgreSQL のコンテナを起動し、マイグレーションとシードを適用して、接続の設定とプールを返す。
func startPostgres(t *testing.T) (postgres.Config, *pgxpool.Pool) {
	t.Helper()
	ctx := context.Background()
	c, err := tcpostgres.Run(ctx, "postgres:18.6",
		tcpostgres.WithDatabase("buddy"), tcpostgres.WithUsername("buddy"), tcpostgres.WithPassword("buddy-test"),
		tcpostgres.BasicWaitStrategies(),
	)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = c.Terminate(ctx) })
	host, err := c.Host(ctx)
	if err != nil {
		t.Fatal(err)
	}
	port, err := c.MappedPort(ctx, "5432/tcp")
	if err != nil {
		t.Fatal(err)
	}
	cfg := postgres.Config{Host: host, Port: port.Port(), User: "buddy", Password: "buddy-test", Name: "buddy"}
	if err := postgres.MigrateUp(cfg); err != nil {
		t.Fatal(err)
	}
	if _, err := postgres.Seed(ctx, cfg, db.Seed); err != nil {
		t.Fatal(err)
	}
	pool, err := postgres.Open(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	return cfg, pool
}
