// Package postgres は、ブローカーの DB への接続とマイグレーションを持つ。
package postgres

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/url"
	"time"

	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/pgx/v5" // pgx5:// のドライバーを登録する
	"github.com/golang-migrate/migrate/v4/source/iofs"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/Fukuemon/buddy/services/broker/db"
)

// Config は、PostgreSQL への接続の設定である。
type Config struct {
	Host     string
	Port     string
	User     string
	Password string
	Name     string
}

// URL は、scheme の接続の URL を返す。値は URL の書式で符号にするので、記号を含むパスワードも渡せる。
// pgx は "postgres"、golang-migrate の pgx/v5 のドライバーは "pgx5" を使う。
func (c Config) URL(scheme string) string {
	u := url.URL{
		Scheme: scheme,
		User:   url.UserPassword(c.User, c.Password),
		Host:   net.JoinHostPort(c.Host, c.Port),
		Path:   "/" + c.Name,
	}
	return u.String()
}

// Open は、接続のプールを作って疎通を確かめる。返したプールは呼び出し側が閉じる。
func Open(ctx context.Context, c Config) (*pgxpool.Pool, error) {
	cfg, err := pgxpool.ParseConfig(c.URL("postgres"))
	if err != nil {
		return nil, fmt.Errorf("parse postgres config: %w", err)
	}
	cfg.MaxConns = 10
	cfg.MaxConnLifetime = 5 * time.Minute
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("open postgres: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping postgres: %w", err)
	}
	return pool, nil
}

// newMigrate は、埋め込んだマイグレーションを c のデータベースに適用する migrate.Migrate を作る。
// 返した値の Close で、接続を閉じる。
func newMigrate(c Config) (*migrate.Migrate, error) {
	src, err := iofs.New(db.Migrations, "migrations")
	if err != nil {
		return nil, fmt.Errorf("open migrations: %w", err)
	}
	m, err := migrate.NewWithSourceInstance("iofs", src, c.URL("pgx5"))
	if err != nil {
		return nil, fmt.Errorf("init migrate: %w", err)
	}
	return m, nil
}

// MigrateUp は、未適用のマイグレーションをすべて適用する。適用済みなら何もしない。
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

// Seed は、ダミーの職員を 1 つのトランザクションで入れ、入れたら true を返す。職員が 1 人でもいれば、
// 何もせず false を返す。compose が起動のたびに適用しても、入れたデータと手で足したデータを壊さないためである。
func Seed(ctx context.Context, c Config, seed []byte) (bool, error) {
	conn, err := pgx.Connect(ctx, c.URL("postgres"))
	if err != nil {
		return false, fmt.Errorf("open postgres: %w", err)
	}
	defer func() { _ = conn.Close(context.WithoutCancel(ctx)) }()
	tx, err := conn.Begin(ctx)
	if err != nil {
		return false, fmt.Errorf("begin seed: %w", err)
	}
	defer func() { _ = tx.Rollback(context.WithoutCancel(ctx)) }()
	var seeded bool
	if err := tx.QueryRow(ctx, "SELECT EXISTS (SELECT 1 FROM staff)").Scan(&seeded); err != nil {
		return false, fmt.Errorf("check seed: %w", err)
	}
	if seeded {
		return false, nil
	}
	if _, err := tx.Exec(ctx, string(seed)); err != nil {
		return false, fmt.Errorf("seed: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return false, fmt.Errorf("commit seed: %w", err)
	}
	return true, nil
}
