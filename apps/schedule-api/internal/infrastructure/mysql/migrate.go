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

// Seed は、架空のデータを入れる。同じ ID の行があると失敗するので、空のデータベースに 1 度だけ当てる。
func Seed(ctx context.Context, c Config, seed []byte) error {
	conn, err := sql.Open("mysql", c.DSN(true))
	if err != nil {
		return fmt.Errorf("open mysql: %w", err)
	}
	defer func() { _ = conn.Close() }()
	if _, err := conn.ExecContext(ctx, string(seed)); err != nil {
		return fmt.Errorf("seed: %w", err)
	}
	return nil
}
