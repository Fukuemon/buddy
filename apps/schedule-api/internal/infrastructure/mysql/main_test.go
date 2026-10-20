package mysql

import (
	"context"
	"database/sql"
	"flag"
	"fmt"
	"log"
	"os"
	"testing"

	driver "github.com/go-sql-driver/mysql"
	tcmysql "github.com/testcontainers/testcontainers-go/modules/mysql"

	"github.com/Fukuemon/buddy/apps/schedule-api/db"
)

// testDB は、TestMain が起動した MySQL 8.4 に、マイグレーションとシードを当てた接続である。
var testDB *sql.DB

// testConfig は、testDB の接続の設定である。
var testConfig Config

func TestMain(m *testing.M) {
	flag.Parse()
	if testing.Short() {
		os.Exit(m.Run())
	}
	os.Exit(runWithMySQL(m))
}

func runWithMySQL(m *testing.M) int {
	ctx := context.Background()
	container, err := tcmysql.Run(ctx, "mysql:8.4",
		tcmysql.WithDatabase("buddy"),
		tcmysql.WithUsername("buddy"),
		tcmysql.WithPassword("buddy-test"),
	)
	if err != nil {
		log.Printf("start mysql container: %v", err)
		return 1
	}
	defer func() {
		if err := container.Terminate(ctx); err != nil {
			log.Printf("terminate mysql container: %v", err)
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
	defer func() { _ = testDB.Close() }()
	return m.Run()
}

func configFromContainer(ctx context.Context, c *tcmysql.MySQLContainer) (Config, error) {
	host, err := c.Host(ctx)
	if err != nil {
		return Config{}, fmt.Errorf("container host: %w", err)
	}
	port, err := c.MappedPort(ctx, "3306/tcp")
	if err != nil {
		return Config{}, fmt.Errorf("container port: %w", err)
	}
	return Config{Host: host, Port: port.Port(), User: "buddy", Password: "buddy-test", Name: "buddy"}, nil
}

// txContext は、テストの終わりにロールバックするトランザクションを持つ ctx を返す。
// テストどうしが書いた行を見ないよう、書き込むテストはこの ctx を使う。
func txContext(t *testing.T) context.Context {
	t.Helper()
	if testDB == nil {
		t.Skip("MySQL を使うテストは -short では動かさない")
	}
	tx, err := testDB.BeginTx(context.Background(), nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = tx.Rollback() })
	return context.WithValue(context.Background(), txKey{}, tx)
}

func TestDSNKeepsPassword(t *testing.T) {
	cfg := Config{Host: "db", Port: "3306", User: "app", Password: "p@ss/w:rd?x=1", Name: "buddy"}
	parsed, err := driver.ParseDSN(cfg.DSN(false))
	if err != nil {
		t.Fatal(err)
	}
	if parsed.Passwd != cfg.Password || parsed.Addr != "db:3306" || parsed.DBName != "buddy" || !parsed.ParseTime {
		t.Fatalf("parsed = %+v", parsed)
	}
}

func TestSeedSkipsWhenFacilitiesExist(t *testing.T) {
	if testDB == nil {
		t.Skip("MySQL を使うテストは -short では動かさない")
	}
	before := countFacilities(t)
	applied, err := Seed(context.Background(), testConfig, db.Seed)
	if err != nil || applied {
		t.Fatalf("applied = %v, err = %v", applied, err)
	}
	if after := countFacilities(t); after != before {
		t.Errorf("facilities = %d, want %d", after, before)
	}
}

func TestSeedRollsBackOnFailure(t *testing.T) {
	if testDB == nil {
		t.Skip("MySQL を使うテストは -short では動かさない")
	}
	ctx := context.Background()
	// testcontainers の MySQL は、root のパスワードを利用者のパスワードと同じにする
	rootCfg := testConfig
	rootCfg.User = "root"
	root, err := Open(ctx, rootCfg)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = root.ExecContext(ctx, "DROP DATABASE seed_rollback")
		_ = root.Close()
	})
	for _, q := range []string{
		"CREATE DATABASE seed_rollback",
		"CREATE TABLE seed_rollback.facilities (name VARCHAR(10) NOT NULL)",
		"GRANT ALL ON seed_rollback.* TO 'buddy'@'%'",
	} {
		if _, err := root.ExecContext(ctx, q); err != nil {
			t.Fatal(err)
		}
	}
	cfg := testConfig
	cfg.Name = "seed_rollback"
	broken := []byte("INSERT INTO facilities (name) VALUES ('a'); INSERT INTO missing_table VALUES (1);")
	if applied, err := Seed(ctx, cfg, broken); err == nil || applied {
		t.Fatalf("applied = %v, err = %v", applied, err)
	}
	var n int
	if err := testDB.QueryRowContext(ctx, "SELECT COUNT(*) FROM seed_rollback.facilities").Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 0 {
		t.Errorf("失敗したシードの行が %d 行残った", n)
	}
}

func countFacilities(t *testing.T) int {
	t.Helper()
	var n int
	if err := testDB.QueryRowContext(context.Background(), "SELECT COUNT(*) FROM facilities").Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}
