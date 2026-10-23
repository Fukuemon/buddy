package postgres

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log"
	"os"
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
	if err := MigrateDown(cfg, 5); err != nil {
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
