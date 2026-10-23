package postgres

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io/fs"
	"log"
	"os"
	"testing"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	tcpostgres "github.com/testcontainers/testcontainers-go/modules/postgres"

	"github.com/Fukuemon/buddy/services/broker/db"
)

// testImage は、compose と CI と同じ PostgreSQL のイメージである。
const testImage = "postgres:18.6"

// testConfig は、TestMain が起動した PostgreSQL の接続の設定である。マイグレーションはまだ適用していない。
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
		tcpostgres.WithDatabase("broker"),
		tcpostgres.WithUsername("broker"),
		tcpostgres.WithPassword("broker-test"),
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
	host, err := container.Host(ctx)
	if err != nil {
		log.Printf("container host: %v", err)
		return 1
	}
	port, err := container.MappedPort(ctx, "5432/tcp")
	if err != nil {
		log.Printf("container port: %v", err)
		return 1
	}
	testConfig = Config{Host: host, Port: port.Port(), User: "broker", Password: "broker-test", Name: "broker"}
	return m.Run()
}

// migrated は、マイグレーションを全て適用した DB の接続のプールを返す。テストの終わりに全て戻し、次のテストにテーブルを残さない。
func migrated(t *testing.T) *pgxpool.Pool {
	t.Helper()
	if testConfig == (Config{}) {
		t.Skip("PostgreSQL を使うテストは -short では動かさない")
	}
	if err := MigrateUp(testConfig); err != nil {
		t.Fatal(err)
	}
	pool, err := Open(context.Background(), testConfig)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		pool.Close()
		if err := MigrateDown(testConfig, migrations(t)); err != nil {
			t.Error(err)
		}
	})
	return pool
}

// migrations は、db.Migrations にあるマイグレーションの版の数を返す。
func migrations(t *testing.T) int {
	t.Helper()
	ups, err := fs.Glob(db.Migrations, "migrations/*.up.sql")
	if err != nil {
		t.Fatal(err)
	}
	return len(ups)
}

const (
	staffA = "01JAAAAAAAAAAAAAAAAAAAAAAA"
	staffB = "01JBBBBBBBBBBBBBBBBBBBBBBB"
)

// TestSchema は、職員と上流のアカウントのテーブルの制約を確かめる。
// 各ケースは、前提の行を入れた後に 1 つの文を流し、違反する制約の名前（空なら成功）を確かめる。
func TestSchema(t *testing.T) {
	pool := migrated(t)
	ctx := context.Background()
	exec := func(sql string, args ...any) error {
		_, err := pool.Exec(ctx, sql, args...)
		return err
	}
	if err := exec(`INSERT INTO staff (id, org_id, email) VALUES ($1, 'org-a', 'aoki@example.com')`, staffA); err != nil {
		t.Fatal(err)
	}
	if err := exec(`INSERT INTO upstream_accounts (staff_id, iss, sub) VALUES ($1, 'https://idp.example.com', 'sub-a')`, staffA); err != nil {
		t.Fatal(err)
	}

	tests := []struct {
		name       string
		sql        string
		args       []any
		constraint string
	}{
		{"事業所の中でメールが重なる", `INSERT INTO staff (id, org_id, email) VALUES ($1, 'org-a', 'aoki@example.com')`, []any{staffB}, "staff_email_key"},
		{"別の事業所でもメールが重なる", `INSERT INTO staff (id, org_id, email) VALUES ($1, 'org-b', 'aoki@example.com')`, []any{staffB}, "staff_email_key"},
		{"大文字を含むメール", `INSERT INTO staff (id, org_id, email) VALUES ($1, 'org-a', 'Aoki@example.com')`, []any{staffB}, "staff_email_lower_check"},
		{"登録の途中の状態", `UPDATE staff SET status = 'pending' WHERE id = $1`, []any{staffA}, ""},
		{"状態が登録の途中、有効、停止のどれでもない", `UPDATE staff SET status = 'deleted' WHERE id = $1`, []any{staffA}, "staff_status_check"},
		{"ULID の形でない職員の ID", `INSERT INTO staff (id, org_id, email) VALUES ('staff-1', 'org-a', 'kato@example.com')`, nil, "staff_id_check"},
		{"空の組織の ID", `INSERT INTO staff (id, org_id, email) VALUES ($1, '', 'kato@example.com')`, []any{staffB}, "staff_org_id_check"},
		{"1 人の職員に 2 つ目の上流のアカウント", `INSERT INTO upstream_accounts (staff_id, iss, sub) VALUES ($1, 'https://idp.example.com', 'sub-x')`, []any{staffA}, "upstream_accounts_pkey"},
		{"同じ iss と sub を 2 人に結び付ける", `INSERT INTO upstream_accounts (staff_id, iss, sub) VALUES ($1, 'https://idp.example.com', 'sub-a')`, []any{staffB}, "upstream_accounts_iss_sub_key"},
		{"登録していない職員の上流のアカウント", `INSERT INTO upstream_accounts (staff_id, iss, sub) VALUES ('01JCCCCCCCCCCCCCCCCCCCCCCC', 'https://idp.example.com', 'sub-c')`, nil, "upstream_accounts_staff_id_fkey"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tx, err := pool.Begin(ctx)
			if err != nil {
				t.Fatal(err)
			}
			defer func() { _ = tx.Rollback(ctx) }()
			_, err = tx.Exec(ctx, tt.sql, tt.args...)
			if got := constraintOf(err); got != tt.constraint {
				t.Errorf("違反した制約 = %q, want %q (err = %v)", got, tt.constraint, err)
			}
		})
	}
}

// TestSchemaUpdatedAtAndCascade は、更新の日時を書き換えることと、職員を消すと上流のアカウントも消えることを確かめる。
func TestSchemaUpdatedAtAndCascade(t *testing.T) {
	pool := migrated(t)
	ctx := context.Background()
	if _, err := pool.Exec(ctx, `INSERT INTO staff (id, org_id, email, updated_at) VALUES ($1, 'org-a', 'aoki@example.com', now() - interval '1 day')`, staffA); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO upstream_accounts (staff_id, iss, sub) VALUES ($1, 'https://idp.example.com', 'sub-a')`, staffA); err != nil {
		t.Fatal(err)
	}
	var fresh bool
	if err := pool.QueryRow(ctx, `UPDATE staff SET status = 'suspended' WHERE id = $1 RETURNING updated_at > now() - interval '1 minute'`, staffA).Scan(&fresh); err != nil {
		t.Fatal(err)
	}
	if !fresh {
		t.Error("更新したときに updated_at を書き換えていない")
	}
	if _, err := pool.Exec(ctx, `DELETE FROM staff WHERE id = $1`, staffA); err != nil {
		t.Fatal(err)
	}
	var n int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM upstream_accounts`).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 0 {
		t.Errorf("職員を消した後の上流のアカウント = %d 件, want 0", n)
	}
}

// constraintOf は、err が PostgreSQL の制約の違反なら制約の名前を、err が nil なら空を返す。
func constraintOf(err error) string {
	if err == nil {
		return ""
	}
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.ConstraintName != "" {
		return pgErr.ConstraintName
	}
	return fmt.Sprintf("制約の違反でないエラー: %v", err)
}
