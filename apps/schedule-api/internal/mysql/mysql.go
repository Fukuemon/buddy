// Package mysql は、domain のリポジトリを MySQL と sqlc の生成コードで実装する。
package mysql

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"math"
	"net"
	"time"

	driver "github.com/go-sql-driver/mysql"

	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain/civil"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/mysql/sqlcgen"
)

// Config は、MySQL への接続の設定である。
type Config struct {
	Host     string
	Port     string
	User     string
	Password string
	Name     string
}

// DSN は、go-sql-driver/mysql の DSN を返す。値はドライバーが書式を整えるので、記号を含むパスワードも渡せる。
// multiStatements は、1 回の実行で複数の文を流すとき（マイグレーションとシード）だけ true にする。
func (c Config) DSN(multiStatements bool) string {
	cfg := driver.NewConfig()
	cfg.Net = "tcp"
	cfg.Addr = net.JoinHostPort(c.Host, c.Port)
	cfg.User = c.User
	cfg.Passwd = c.Password
	cfg.DBName = c.Name
	cfg.ParseTime = true
	cfg.Loc = time.UTC
	cfg.MultiStatements = multiStatements
	return cfg.FormatDSN()
}

// Open は、接続を開いて疎通を確かめる。返した *sql.DB は呼び出し側が閉じる。
func Open(ctx context.Context, c Config) (*sql.DB, error) {
	db, err := sql.Open("mysql", c.DSN(false))
	if err != nil {
		return nil, fmt.Errorf("open mysql: %w", err)
	}
	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(25)
	db.SetConnMaxLifetime(5 * time.Minute)
	if err := db.PingContext(ctx); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("ping mysql: %w", err)
	}
	return db, nil
}

type txKey struct{}

// Transactor は、domain.Transactor を *sql.Tx で実装する。
type Transactor struct {
	db *sql.DB
}

// NewTransactor は Transactor を作る。
func NewTransactor(db *sql.DB) *Transactor { return &Transactor{db: db} }

// WithinTx は、fn をトランザクションの中で実行する。ctx がすでにトランザクションを持つときは、それに加わる。
func (t *Transactor) WithinTx(ctx context.Context, fn func(ctx context.Context) error) (err error) {
	if _, ok := ctx.Value(txKey{}).(*sql.Tx); ok {
		return fn(ctx)
	}
	tx, err := t.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer func() {
		if p := recover(); p != nil {
			_ = tx.Rollback()
			panic(p)
		}
		if err != nil {
			_ = tx.Rollback()
		}
	}()
	if err := fn(context.WithValue(ctx, txKey{}, tx)); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit tx: %w", err)
	}
	return nil
}

// conn は、ctx にトランザクションがあればそれを、なければ接続のプールを使ってクエリを発行する。
type conn struct {
	db *sql.DB
}

func (c conn) q(ctx context.Context) *sqlcgen.Queries {
	if tx, ok := ctx.Value(txKey{}).(*sql.Tx); ok {
		return sqlcgen.New(tx)
	}
	return sqlcgen.New(c.db)
}

// MySQL のエラー番号。https://dev.mysql.com/doc/mysql-errors/8.4/en/server-error-reference.html
const (
	erDupEntry          = 1062
	erNoReferencedRow2  = 1452
	erCheckConstraint   = 3819
	erDataTooLong       = 1406
	erTruncatedWrongVal = 1292
)

// translate は、ドライバーのエラーを domain のエラーに置き換える。対応しないエラーは文脈を付けて返す。
func translate(op string, err error) error {
	if err == nil {
		return nil
	}
	if errors.Is(err, sql.ErrNoRows) {
		return domain.ErrNotFound
	}
	var me *driver.MySQLError
	if errors.As(err, &me) {
		switch me.Number {
		case erDupEntry:
			return domain.ErrConflict
		case erNoReferencedRow2:
			return domain.Invalid("参照先が見つかりません")
		case erCheckConstraint, erDataTooLong, erTruncatedWrongVal:
			return domain.Invalid("値が列の制約に合いません")
		}
	}
	return fmt.Errorf("%s: %w", op, err)
}

func nullString(s *string) sql.NullString {
	if s == nil {
		return sql.NullString{}
	}
	return sql.NullString{String: *s, Valid: true}
}

func stringPtr(s sql.NullString) *string {
	if !s.Valid {
		return nil
	}
	return &s.String
}

// optional は、空の文字列を NULL にする。
func optional(s string) sql.NullString {
	return sql.NullString{String: s, Valid: s != ""}
}

// nonNil は、nil を空のスライスにする。応答の JSON で null ではなく [] にするためである。
func nonNil(s []string) []string {
	if s == nil {
		return []string{}
	}
	return s
}

func nullInt16(v *int) (sql.NullInt16, error) {
	if v == nil {
		return sql.NullInt16{}, nil
	}
	if *v < math.MinInt16 || *v > math.MaxInt16 {
		return sql.NullInt16{}, domain.Invalid("値 %d が範囲を超えています", *v)
	}
	return sql.NullInt16{Int16: int16(*v), Valid: true}, nil
}

func intPtr(v sql.NullInt16) *int {
	if !v.Valid {
		return nil
	}
	i := int(v.Int16)
	return &i
}

func nullDate(d *civil.Date) sql.NullTime {
	if d == nil {
		return sql.NullTime{}
	}
	return sql.NullTime{Time: d.Time(), Valid: true}
}

func datePtr(t sql.NullTime) *civil.Date {
	if !t.Valid {
		return nil
	}
	d := civil.DateOf(t.Time)
	return &d
}

func timeOfDay(t civil.Time) string {
	return fmt.Sprintf("%02d:%02d:00", t.Hour, t.Minute)
}

func parseTimeOfDay(s string) (civil.Time, error) {
	t, err := civil.ParseTime(s)
	if err != nil {
		return civil.Time{}, fmt.Errorf("scan time %q: %w", s, err)
	}
	return t, nil
}
