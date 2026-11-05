package postgres

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log"
	"maps"
	"os"
	"slices"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	tcpostgres "github.com/testcontainers/testcontainers-go/modules/postgres"

	"github.com/Fukuemon/buddy/services/schedule/db"
)

// testImage は、compose と CI と同じ PostgreSQL のイメージである。
const testImage = "postgres:18.6"

// testDB は、TestMain が起動した PostgreSQL に、マイグレーションとシードを適用した接続のプールである。
var testDB *pgxpool.Pool

// testConfig は、testDB の接続の設定である。利用者は、データベースを作れる管理者である。
var testConfig Config

func TestMain(m *testing.M) {
	flag.Parse()
	if testing.Short() {
		os.Exit(m.Run())
	}
	os.Exit(runWithPostgres(m))
}

func runWithPostgres(m *testing.M) int {
	ctx := context.Background()
	container, err := tcpostgres.Run(ctx, testImage,
		tcpostgres.WithDatabase("buddy"),
		tcpostgres.WithUsername("buddy"),
		tcpostgres.WithPassword("buddy-test"),
		tcpostgres.BasicWaitStrategies(),
	)
	if err != nil {
		log.Printf("start postgres container: %v", err)
		return 1
	}
	defer func() {
		if err := container.Terminate(ctx); err != nil {
			log.Printf("terminate postgres container: %v", err)
		}
	}()
	cfg, err := configFromContainer(ctx, container)
	if err != nil {
		log.Print(err)
		return 1
	}
	if err := MigrateUp(cfg); err != nil {
		log.Print(err)
		return 1
	}
	if applied, err := Seed(ctx, cfg, db.Seed); err != nil || !applied {
		log.Printf("seed: applied = %v, err = %v", applied, err)
		return 1
	}
	testConfig = cfg
	testDB, err = Open(ctx, cfg)
	if err != nil {
		log.Print(err)
		return 1
	}
	defer testDB.Close()
	return m.Run()
}

func configFromContainer(ctx context.Context, c *tcpostgres.PostgresContainer) (Config, error) {
	host, err := c.Host(ctx)
	if err != nil {
		return Config{}, fmt.Errorf("container host: %w", err)
	}
	port, err := c.MappedPort(ctx, "5432/tcp")
	if err != nil {
		return Config{}, fmt.Errorf("container port: %w", err)
	}
	return Config{Host: host, Port: port.Port(), User: "buddy", Password: "buddy-test", Name: "buddy"}, nil
}

// txContext は、テストの終わりにロールバックするトランザクションを持つ ctx を返す。
// テストどうしが書いたレコードを見ないよう、書き込むテストはこの ctx を使う。
// PostgreSQL は失敗した文の後でトランザクション全体を止めるので、文ごとにセーブポイントを置き、失敗した文だけを巻き戻す。
// 制約の違反を確認した後も、同じトランザクションで続けられる。
func txContext(t *testing.T) context.Context {
	t.Helper()
	if testDB == nil {
		t.Skip("PostgreSQL を使うテストは -short では動かさない")
	}
	tx, err := testDB.Begin(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = tx.Rollback(context.Background()) })
	return context.WithValue(context.Background(), txKey{}, savepointTx{tx})
}

// savepointTx は、Exec と QueryRow の 1 文ごとにセーブポイントを置く pgx.Tx である。
// Query（sqlc の :many）は包まない。今の :many は読み出しだけで、制約の違反で失敗しないためである。
// 本番のトランザクションは失敗した文の後に止まるが、このテストでは続けられる。失敗を握りつぶして続ける手順は、このテストでは見つからない。
type savepointTx struct{ pgx.Tx }

func (s savepointTx) Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error) {
	if _, err := s.Tx.Exec(ctx, "SAVEPOINT stmt"); err != nil {
		return pgconn.CommandTag{}, err
	}
	tag, err := s.Tx.Exec(ctx, sql, args...)
	return tag, s.end(ctx, err)
}

func (s savepointTx) QueryRow(ctx context.Context, sql string, args ...any) pgx.Row {
	if _, err := s.Tx.Exec(ctx, "SAVEPOINT stmt"); err != nil {
		return errRow{err}
	}
	return savepointRow{s, s.Tx.QueryRow(ctx, sql, args...), ctx}
}

// end は、err があればセーブポイントまで巻き戻し、なければセーブポイントを外して err を返す。
func (s savepointTx) end(ctx context.Context, err error) error {
	if err != nil {
		_, _ = s.Tx.Exec(ctx, "ROLLBACK TO SAVEPOINT stmt")
		return err
	}
	_, err = s.Tx.Exec(ctx, "RELEASE SAVEPOINT stmt")
	return err
}

type savepointRow struct {
	tx  savepointTx
	row pgx.Row
	ctx context.Context
}

func (r savepointRow) Scan(dest ...any) error {
	err := r.row.Scan(dest...)
	if errors.Is(err, pgx.ErrNoRows) {
		_ = r.tx.end(r.ctx, nil)
		return err
	}
	return r.tx.end(r.ctx, err)
}

type errRow struct{ err error }

func (r errRow) Scan(...any) error { return r.err }

// newDatabase は、空のデータベースを作り、その接続の設定を返す。テストの終わりに消す。
func newDatabase(t *testing.T, name string) Config {
	t.Helper()
	if testDB == nil {
		t.Skip("PostgreSQL を使うテストは -short では動かさない")
	}
	ctx := context.Background()
	if _, err := testDB.Exec(ctx, "CREATE DATABASE "+pgx.Identifier{name}.Sanitize()); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = testDB.Exec(ctx, "DROP DATABASE "+pgx.Identifier{name}.Sanitize()+" WITH (FORCE)")
	})
	cfg := testConfig
	cfg.Name = name
	return cfg
}

func TestURLKeepsPassword(t *testing.T) {
	cfg := Config{Host: "db", Port: "5432", User: "app", Password: "p@ss/w:rd?x=1#%", Name: "buddy"}
	parsed, err := pgx.ParseConfig(cfg.URL("postgres"))
	if err != nil {
		t.Fatal(err)
	}
	if parsed.Password != cfg.Password || parsed.Host != "db" || parsed.Port != 5432 || parsed.User != "app" || parsed.Database != "buddy" {
		t.Fatalf("parsed = %+v", parsed.Config)
	}
}

func TestOpenMaxConns(t *testing.T) {
	if testDB == nil {
		t.Skip("PostgreSQL を使うテストは -short では動かさない")
	}
	for _, tt := range []struct{ set, want int32 }{{0, defaultMaxConns}, {3, 3}} {
		cfg := testConfig
		cfg.MaxConns = tt.set
		pool, err := Open(context.Background(), cfg)
		if err != nil {
			t.Fatal(err)
		}
		if got := pool.Config().MaxConns; got != tt.want {
			t.Errorf("MaxConns %d の接続の数の上限 = %d, want %d", tt.set, got, tt.want)
		}
		pool.Close()
	}
}

func TestSeedSkipsWhenFacilitiesExist(t *testing.T) {
	if testDB == nil {
		t.Skip("PostgreSQL を使うテストは -short では動かさない")
	}
	before := countFacilities(t, testDB)
	applied, err := Seed(context.Background(), testConfig, db.Seed)
	if err != nil || applied {
		t.Fatalf("applied = %v, err = %v", applied, err)
	}
	if after := countFacilities(t, testDB); after != before {
		t.Errorf("facilities = %d, want %d", after, before)
	}
}

func TestSeedRollsBackOnFailure(t *testing.T) {
	cfg := newDatabase(t, "seed_rollback")
	ctx := context.Background()
	pool, err := Open(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	if _, err := pool.Exec(ctx, "CREATE TABLE facilities (name text NOT NULL)"); err != nil {
		t.Fatal(err)
	}
	broken := []byte("INSERT INTO facilities (name) VALUES ('a'); INSERT INTO missing_table VALUES (1);")
	if applied, err := Seed(ctx, cfg, broken); err == nil || applied {
		t.Fatalf("applied = %v, err = %v", applied, err)
	}
	if n := countFacilities(t, pool); n != 0 {
		t.Errorf("失敗したシードのレコードが %d 件残った", n)
	}
}

// TestMigrateDownAndUp は、初期のマイグレーションを戻すとテーブルとビューと関数が残らず、もう一度適用できることを確認する。
func TestMigrateDownAndUp(t *testing.T) {
	cfg := newDatabase(t, "migrate_round_trip")
	ctx := context.Background()
	if err := MigrateUp(cfg); err != nil {
		t.Fatal(err)
	}
	if err := MigrateDown(cfg, 14); err != nil {
		t.Fatal(err)
	}
	pool, err := Open(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	var n int
	err = pool.QueryRow(ctx, `
		SELECT (SELECT count(*) FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
		        WHERE ns.nspname = 'public' AND c.relkind IN ('r', 'v') AND c.relname <> 'schema_migrations')
		     + (SELECT count(*) FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace WHERE ns.nspname = 'public')`).Scan(&n)
	if err != nil {
		t.Fatal(err)
	}
	if n != 0 {
		t.Errorf("戻した後にテーブル、ビュー、関数が %d 個残った", n)
	}
	if err := MigrateUp(cfg); err != nil {
		t.Fatal(err)
	}
}

func countFacilities(t *testing.T, pool *pgxpool.Pool) int {
	t.Helper()
	var n int
	if err := pool.QueryRow(context.Background(), "SELECT count(*) FROM facilities").Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}

// TestMigrateReceiptCheckPolicy は、照合の権限のマイグレーションが、今ある事業所に事務の役職を足し、
// 職員の管理の権限をデフォルトに持つ役職と、職員の管理の権限を持つ退職していない職員に、照合の権限を足すことを確認する（ADR-0015、#376）。
func TestMigrateReceiptCheckPolicy(t *testing.T) {
	cfg := newDatabase(t, "migrate_receipt_check")
	ctx := context.Background()
	if err := MigrateUp(cfg); err != nil {
		t.Fatal(err)
	}
	// 後に続く職員の訪問するか（000010）、終了が翌日の予定（000011）、事業所の正本のモード（000012）、予定の写し（000013）、切り替え（000014）のマイグレーションと合わせて戻す
	if err := MigrateDown(cfg, 6); err != nil {
		t.Fatal(err)
	}
	pool, err := Open(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	const (
		facility = "01M3TD00000000000000000010"
		manager  = "01M3TD00000000000000000011"
		member   = "01M3TD00000000000000000012"
		dept     = "01M3TD00000000000000000013"
		team     = "01M3TD00000000000000000014"
		managerU = "01M3TD00000000000000000015"
		retiredU = "01M3TD00000000000000000016"
		memberU  = "01M3TD00000000000000000017"
	)
	_, err = pool.Exec(ctx, `
		INSERT INTO facilities (id, name) VALUES ('`+facility+`', '事業所');
		INSERT INTO positions (id, facility_id, name) VALUES
			('`+manager+`', '`+facility+`', '管理者'), ('`+member+`', '`+facility+`', 'メンバー');
		INSERT INTO position_policies (position_id, policy_id)
		SELECT '`+manager+`', id FROM policies WHERE code IN ('schedule.all.read', 'staff.manage')
		UNION ALL SELECT '`+member+`', id FROM policies WHERE code = 'schedule.self.edit';
		INSERT INTO departments (id, facility_id, name) VALUES ('`+dept+`', '`+facility+`', '看護');
		INSERT INTO teams (id, facility_id, name, color) VALUES ('`+team+`', '`+facility+`', 'A', 'blue');
		INSERT INTO users (id, facility_id, username, email, department_id, team_id, position_id) VALUES
			('`+managerU+`', '`+facility+`', '管理者', 'manager@example.com', '`+dept+`', '`+team+`', '`+manager+`'),
			('`+memberU+`', '`+facility+`', 'メンバー', 'member@example.com', '`+dept+`', '`+team+`', '`+member+`');
		INSERT INTO users (id, facility_id, username, email, department_id, team_id, position_id, retired_at) VALUES
			('`+retiredU+`', '`+facility+`', '退職', NULL, '`+dept+`', '`+team+`', '`+manager+`', now());
		INSERT INTO user_policies (id, facility_id, user_id, policy_id)
		SELECT '01M3TD0000000000000000002' || n, '`+facility+`', u, id FROM policies,
			(VALUES ('0', '`+managerU+`'), ('1', '`+retiredU+`')) AS v(n, u) WHERE code = 'staff.manage';`)
	if err != nil {
		t.Fatal(err)
	}
	if err := MigrateUp(cfg); err != nil {
		t.Fatal(err)
	}

	got := map[string][]string{}
	rows, err := pool.Query(ctx, `
		SELECT ps.name, p.code FROM positions ps
		JOIN position_policies pp ON pp.position_id = ps.id
		JOIN policies p ON p.id = pp.policy_id
		WHERE ps.facility_id = $1 ORDER BY ps.name, p.code`, facility)
	if err != nil {
		t.Fatal(err)
	}
	for rows.Next() {
		var name, code string
		if err := rows.Scan(&name, &code); err != nil {
			t.Fatal(err)
		}
		got[name] = append(got[name], code)
	}
	if err := rows.Err(); err != nil {
		t.Fatal(err)
	}
	want := map[string][]string{
		"管理者":  {"receipt.check", "schedule.all.read", "staff.manage"},
		"メンバー": {"schedule.self.edit"},
		"事務":   {"receipt.check", "schedule.all.edit", "schedule.all.read"},
	}
	if !maps.EqualFunc(got, want, slices.Equal) {
		t.Errorf("役職のデフォルトの権限 = %v, want %v", got, want)
	}

	var checkers []string
	rows, err = pool.Query(ctx, `
		SELECT up.user_id FROM user_policies up JOIN policies p ON p.id = up.policy_id
		WHERE p.code = 'receipt.check' ORDER BY up.user_id`)
	if err != nil {
		t.Fatal(err)
	}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			t.Fatal(err)
		}
		checkers = append(checkers, id)
	}
	if err := rows.Err(); err != nil {
		t.Fatal(err)
	}
	if !slices.Equal(checkers, []string{managerU}) {
		t.Errorf("照合の権限を持つ職員 = %v, want 職員の管理の権限を持つ退職していない職員 %s だけ", checkers, managerU)
	}

	// 戻しても事務の役職は残り、照合の権限だけが消える。
	if err := MigrateDown(cfg, 6); err != nil {
		t.Fatal(err)
	}
	if got, want := clerkPolicies(t, pool, facility), []string{"schedule.all.edit", "schedule.all.read"}; !slices.Equal(got, want) {
		t.Errorf("戻した後の事務の役職のデフォルトの権限 = %v, want %v", got, want)
	}

	// 流し直すと、残した事務の役職に照合の権限が戻る。
	if err := MigrateUp(cfg); err != nil {
		t.Fatal(err)
	}
	if got, want := clerkPolicies(t, pool, facility), []string{"receipt.check", "schedule.all.edit", "schedule.all.read"}; !slices.Equal(got, want) {
		t.Errorf("流し直した後の事務の役職のデフォルトの権限 = %v, want %v", got, want)
	}
}

func clerkPolicies(t *testing.T, pool *pgxpool.Pool, facility string) []string {
	t.Helper()
	rows, err := pool.Query(context.Background(), `
		SELECT p.code FROM positions ps
		JOIN position_policies pp ON pp.position_id = ps.id
		JOIN policies p ON p.id = pp.policy_id
		WHERE ps.facility_id = $1 AND ps.name = '事務' ORDER BY p.code`, facility)
	if err != nil {
		t.Fatal(err)
	}
	codes, err := pgx.CollectRows(rows, pgx.RowTo[string])
	if err != nil {
		t.Fatal(err)
	}
	return codes
}

// TestMigrateTeamColor は、チームの色のマイグレーションが、今あるチームに事業所ごとに名前の順で 8 色を入れ、9 個目から先頭に戻ることを確認する。
func TestMigrateTeamColor(t *testing.T) {
	cfg := newDatabase(t, "migrate_team_color")
	ctx := context.Background()
	if err := MigrateUp(cfg); err != nil {
		t.Fatal(err)
	}
	// 後に続く照合の権限（000009）、職員の訪問するか（000010）、終了が翌日の予定（000011）、事業所の正本のモード（000012）、予定の写し（000013）、切り替え（000014）のマイグレーションと合わせて戻す
	if err := MigrateDown(cfg, 7); err != nil {
		t.Fatal(err)
	}
	pool, err := Open(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	const f1, f2 = "01M3TE00000000000000000001", "01M3TE00000000000000000002"
	stmts := []string{
		"INSERT INTO facilities (id, name) VALUES ('" + f1 + "', '事業所 1'), ('" + f2 + "', '事業所 2')",
		"INSERT INTO teams (id, facility_id, name) VALUES ('01M3TE000000000000000000Z1', '" + f2 + "', 'あ')",
	}
	// 事業所 1 の 9 個のチームを、名前の順と違う ID の順で入れる
	for i, name := range []string{"I", "H", "G", "F", "E", "D", "C", "B", "A"} {
		stmts = append(stmts, "INSERT INTO teams (id, facility_id, name) VALUES ('01M3TE000000000000000000A"+string(rune('0'+i))+"', '"+f1+"', '"+name+"')")
	}
	for _, s := range stmts {
		if _, err := pool.Exec(ctx, s); err != nil {
			t.Fatal(err)
		}
	}
	if err := MigrateUp(cfg); err != nil {
		t.Fatal(err)
	}
	rows, err := pool.Query(ctx, "SELECT facility_id, name, color FROM teams ORDER BY facility_id, name")
	if err != nil {
		t.Fatal(err)
	}
	var got []string
	for rows.Next() {
		var fid, name, color string
		if err := rows.Scan(&fid, &name, &color); err != nil {
			t.Fatal(err)
		}
		got = append(got, fid[len(fid)-1:]+":"+name+"="+color)
	}
	if err := rows.Err(); err != nil {
		t.Fatal(err)
	}
	want := []string{
		"1:A=blue", "1:B=orange", "1:C=magenta", "1:D=cyan", "1:E=yellow", "1:F=purple", "1:G=green", "1:H=lime", "1:I=blue",
		"2:あ=blue",
	}
	if !slices.Equal(got, want) {
		t.Errorf("teams = %v, want %v", got, want)
	}
}

// TestMigrateFacilitySourceMode は、正本のモードのマイグレーションが、今ある事業所を buddy_primary にし、
// 後から足す事業所のデフォルトを google_primary にし、2 つの値のほかを拒むことを確認する（ADR-0023）。
func TestMigrateFacilitySourceMode(t *testing.T) {
	cfg := newDatabase(t, "migrate_facility_source_mode")
	ctx := context.Background()
	if err := MigrateUp(cfg); err != nil {
		t.Fatal(err)
	}
	if err := MigrateDown(cfg, 3); err != nil {
		t.Fatal(err)
	}
	pool, err := Open(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	const existing, added = "01M3TE00000000000000000011", "01M3TE00000000000000000012"
	if _, err := pool.Exec(ctx, "INSERT INTO facilities (id, name) VALUES ($1, '今ある事業所')", existing); err != nil {
		t.Fatal(err)
	}
	if err := MigrateUp(cfg); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, "INSERT INTO facilities (id, name) VALUES ($1, '足した事業所')", added); err != nil {
		t.Fatal(err)
	}
	for id, want := range map[string]string{existing: "buddy_primary", added: "google_primary"} {
		var got string
		if err := pool.QueryRow(ctx, "SELECT source_mode FROM facilities WHERE id = $1", id).Scan(&got); err != nil {
			t.Fatal(err)
		}
		if got != want {
			t.Errorf("事業所 %s の source_mode = %s, want %s", id, got, want)
		}
	}
	if _, err := pool.Exec(ctx, "UPDATE facilities SET source_mode = 'migrating' WHERE id = $1", added); err == nil {
		t.Error("2 つの値のほかのモードを入れられた")
	}
}
