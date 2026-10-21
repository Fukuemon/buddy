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

// TestMigration10BackfillsStaffManage は、000010 が、000009 までの DB で事業所の全ての予定の編集を持つ役職と職員に、
// 職員の管理の権限を足し、戻すと消すことを確かめる。
func TestMigration10BackfillsStaffManage(t *testing.T) {
	if testDB == nil {
		t.Skip("MySQL を使うテストは -short では動かさない")
	}
	ctx := context.Background()
	rootCfg := testConfig
	rootCfg.User = "root"
	root, err := Open(ctx, rootCfg)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = root.ExecContext(ctx, "DROP DATABASE backfill")
		_ = root.Close()
	})
	for _, q := range []string{"CREATE DATABASE backfill", "GRANT ALL ON backfill.* TO 'buddy'@'%'"} {
		if _, err := root.ExecContext(ctx, q); err != nil {
			t.Fatal(err)
		}
	}
	cfg := testConfig
	cfg.Name = "backfill"
	if err := MigrateUp(cfg); err != nil {
		t.Fatal(err)
	}
	if err := MigrateDown(cfg, 1); err != nil {
		t.Fatal(err)
	}
	const allEdit, staffManage = "01M5E1S42TTS7QZK05YGS0GYRE", "01M5E5GP6Q8BQYNWN66QHJF60J"
	for _, q := range []string{
		"INSERT INTO backfill.facilities (id, name, org_id) VALUES ('01M3TE00000000000000000001', '事業所', 'org-backfill')",
		"INSERT INTO backfill.departments (id, facility_id, name) VALUES ('01M3TE00000000000000000002', '01M3TE00000000000000000001', '看護')",
		"INSERT INTO backfill.teams (id, facility_id, name) VALUES ('01M3TE00000000000000000003', '01M3TE00000000000000000001', 'A')",
		"INSERT INTO backfill.positions (id, facility_id, name) VALUES ('01M3TE00000000000000000004', '01M3TE00000000000000000001', '所長'), ('01M3TE00000000000000000005', '01M3TE00000000000000000001', '職員')",
		"INSERT INTO backfill.position_policies (position_id, policy_id) VALUES ('01M3TE00000000000000000004', '" + allEdit + "')",
		"INSERT INTO backfill.users (id, username, email, facility_id, department_id, team_id, position_id) VALUES " +
			"('01M3TE00000000000000000006', '所長', 'chief@example.com', '01M3TE00000000000000000001', '01M3TE00000000000000000002', '01M3TE00000000000000000003', '01M3TE00000000000000000004'), " +
			"('01M3TE00000000000000000007', '職員', 'staff@example.com', '01M3TE00000000000000000001', '01M3TE00000000000000000002', '01M3TE00000000000000000003', '01M3TE00000000000000000005')",
		"INSERT INTO backfill.user_policies (id, user_id, policy_id) VALUES ('01M3TE00000000000000000008', '01M3TE00000000000000000006', '" + allEdit + "')",
	} {
		if _, err := testDB.ExecContext(ctx, q); err != nil {
			t.Fatal(err)
		}
	}
	if err := MigrateUp(cfg); err != nil {
		t.Fatal(err)
	}
	count := func(q string) int {
		t.Helper()
		var n int
		if err := testDB.QueryRowContext(ctx, q, staffManage).Scan(&n); err != nil {
			t.Fatal(err)
		}
		return n
	}
	if n := count("SELECT COUNT(*) FROM backfill.user_policies WHERE user_id = '01M3TE00000000000000000006' AND policy_id = ?"); n != 1 {
		t.Errorf("全ての編集を持つ職員の職員の管理 = %d, want 1", n)
	}
	if n := count("SELECT COUNT(*) FROM backfill.user_policies WHERE user_id = '01M3TE00000000000000000007' AND policy_id = ?"); n != 0 {
		t.Errorf("全ての編集を持たない職員の職員の管理 = %d, want 0", n)
	}
	if n := count("SELECT COUNT(*) FROM backfill.position_policies WHERE position_id = '01M3TE00000000000000000004' AND policy_id = ?"); n != 1 {
		t.Errorf("全ての編集を既定に持つ役職の職員の管理 = %d, want 1", n)
	}
	if err := MigrateDown(cfg, 1); err != nil {
		t.Fatal(err)
	}
	if n := count("SELECT COUNT(*) FROM backfill.user_policies WHERE policy_id = ?"); n != 0 {
		t.Errorf("戻した後の職員の管理 = %d, want 0", n)
	}
}
