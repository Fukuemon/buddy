package mysql

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/golang-migrate/migrate/v4"
	migratemysql "github.com/golang-migrate/migrate/v4/database/mysql"
	"github.com/golang-migrate/migrate/v4/source/iofs"

	"github.com/Fukuemon/buddy/apps/schedule-api/db"
)

// newMigrate は、埋め込んだマイグレーションを c のデータベースに当てる migrate.Migrate を作る。
// 返した値の Close で、接続を閉じる。
func newMigrate(c Config) (*migrate.Migrate, error) {
	src, err := iofs.New(db.Migrations, "migrations")
	if err != nil {
		return nil, fmt.Errorf("open migrations: %w", err)
	}
	conn, err := sql.Open("mysql", c.DSN(true))
	if err != nil {
		return nil, fmt.Errorf("open mysql: %w", err)
	}
	driver, err := migratemysql.WithInstance(conn, &migratemysql.Config{})
	if err != nil {
		_ = conn.Close()
		return nil, fmt.Errorf("init migrate driver: %w", err)
	}
	m, err := migrate.NewWithInstance("iofs", src, "mysql", driver)
	if err != nil {
		_ = conn.Close()
		return nil, fmt.Errorf("init migrate: %w", err)
	}
	return m, nil
}

// MigrateUp は、未適用のマイグレーションをすべて当てる。適用済みなら何もしない。
func MigrateUp(c Config) error {
	m, err := newMigrate(c)
	if err != nil {
		return err
	}
	defer func() { _, _ = m.Close() }()
	if err := m.Up(); err != nil && !errors.Is(err, migrate.ErrNoChange) {
		return fmt.Errorf("migrate up: %w", err)
	}
	return nil
}

// MigrateDown は、マイグレーションを steps 版だけ戻す。
func MigrateDown(c Config, steps int) error {
	m, err := newMigrate(c)
	if err != nil {
		return err
	}
	defer func() { _, _ = m.Close() }()
	if err := m.Steps(-steps); err != nil {
		return fmt.Errorf("migrate down: %w", err)
	}
	return nil
}

// Seed は、架空のデータを 1 つのトランザクションで入れ、入れたら true を返す。事業所の行が 1 つでもあれば、
// 何もせず false を返す。compose が起動のたびに当てても、入れたデータと手で足したデータを壊さないためである。
// seed は DML だけにする。DDL は暗黙にコミットされ、失敗したときに巻き戻せない。
func Seed(ctx context.Context, c Config, seed []byte) (bool, error) {
	conn, err := sql.Open("mysql", c.DSN(true))
	if err != nil {
		return false, fmt.Errorf("open mysql: %w", err)
	}
	defer func() { _ = conn.Close() }()
	tx, err := conn.BeginTx(ctx, nil)
	if err != nil {
		return false, fmt.Errorf("begin seed: %w", err)
	}
	defer func() { _ = tx.Rollback() }()
	var seeded bool
	if err := tx.QueryRowContext(ctx, "SELECT EXISTS (SELECT 1 FROM facilities)").Scan(&seeded); err != nil {
		return false, fmt.Errorf("check seed: %w", err)
	}
	if seeded {
		return false, nil
	}
	if _, err := tx.ExecContext(ctx, string(seed)); err != nil {
		return false, fmt.Errorf("seed: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return false, fmt.Errorf("commit seed: %w", err)
	}
	return true, nil
}
