// Package postgres は、機能のパッケージのリポジトリを PostgreSQL と sqlc の生成コードで実装する。
package postgres

import (
	"context"
	"errors"
	"fmt"
	"math"
	"net"
	"net/url"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/Fukuemon/buddy/apps/schedule-api/internal/apperr"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/civil"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/postgres/sqlcgen"
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
	cfg.MaxConns = 25
	cfg.MaxConnLifetime = 5 * time.Minute
	cfg.AfterConnect = func(_ context.Context, conn *pgx.Conn) error {
		scanTimestamptzInUTC(conn)
		return nil
	}
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

// scanTimestamptzInUTC は、timestamptz を UTC の time.Time で読むようにする。pgx のデフォルトは time.Local で、
// レスポンスの日時のオフセットがプロセスのタイムゾーンで変わるためである。
func scanTimestamptzInUTC(conn *pgx.Conn) {
	conn.TypeMap().RegisterType(&pgtype.Type{
		Name:  "timestamptz",
		OID:   pgtype.TimestamptzOID,
		Codec: &pgtype.TimestamptzCodec{ScanLocation: time.UTC},
	})
}

type txKey struct{}

// Transactor は、tx.Transactor を pgx.Tx で実装する。
type Transactor struct {
	pool *pgxpool.Pool
}

// NewTransactor は Transactor を作る。
func NewTransactor(pool *pgxpool.Pool) *Transactor { return &Transactor{pool: pool} }

// WithinTx は、fn をトランザクションの中で実行する。ctx がすでにトランザクションを持つときは、それに加わる。
func (t *Transactor) WithinTx(ctx context.Context, fn func(ctx context.Context) error) (err error) {
	if _, ok := ctx.Value(txKey{}).(pgx.Tx); ok {
		return fn(ctx)
	}
	tx, err := t.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer func() {
		if p := recover(); p != nil {
			_ = tx.Rollback(context.WithoutCancel(ctx))
			panic(p)
		}
		if err != nil {
			_ = tx.Rollback(context.WithoutCancel(ctx))
		}
	}()
	if err := fn(context.WithValue(ctx, txKey{}, tx)); err != nil {
		return err
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit tx: %w", err)
	}
	return nil
}

// conn は、ctx にトランザクションがあればそれを、なければ接続のプールを使ってクエリを発行する。
type conn struct {
	pool *pgxpool.Pool
}

func (c conn) q(ctx context.Context) *sqlcgen.Queries {
	if tx, ok := ctx.Value(txKey{}).(pgx.Tx); ok {
		return sqlcgen.New(tx)
	}
	return sqlcgen.New(c.pool)
}

// PostgreSQL の SQLSTATE。https://www.postgresql.org/docs/18/errcodes-appendix.html
const (
	uniqueViolation          = "23505"
	foreignKeyViolation      = "23503"
	checkViolation           = "23514"
	notNullViolation         = "23502"
	stringDataRightTrunc     = "22001"
	characterNotInRepertoire = "22021"
	numericValueOutOfRange   = "22003"
)

// translate は、ドライバーのエラーを apperr のエラーに置き換える。対応しないエラーは、文脈と制約の名前を付けて返す。
func translate(op string, err error) error {
	if err == nil {
		return nil
	}
	if errors.Is(err, pgx.ErrNoRows) {
		return apperr.ErrNotFound
	}
	var pe *pgconn.PgError
	if errors.As(err, &pe) {
		switch pe.Code {
		case uniqueViolation:
			return apperr.ErrConflict
		case foreignKeyViolation:
			return apperr.Invalid("参照先が見つかりません")
		case checkViolation, notNullViolation, stringDataRightTrunc, numericValueOutOfRange:
			return apperr.Invalid("値がカラムの制約に合いません")
		case characterNotInRepertoire:
			// text は NUL（U+0000）を受け付けない
			return apperr.Invalid("値に使えない文字が含まれています")
		}
		if pe.ConstraintName != "" {
			return fmt.Errorf("%s (%s): %w", op, pe.ConstraintName, err)
		}
	}
	return fmt.Errorf("%s: %w", op, err)
}

func ptr[T any](v T) *T { return &v }

// optional は、空の文字列を NULL にする。
func optional(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

// nonNil は、nil を空のスライスにする。レスポンスの JSON で null ではなく [] にするためである。
func nonNil(s []string) []string {
	if s == nil {
		return []string{}
	}
	return s
}

func nullInt16(v *int) (*int16, error) {
	if v == nil {
		return nil, nil
	}
	if *v < math.MinInt16 || *v > math.MaxInt16 {
		return nil, apperr.Invalid("値 %d が範囲を超えています", *v)
	}
	i := int16(*v)
	return &i, nil
}

func int32Of(v int) (int32, error) {
	if v < math.MinInt32 || v > math.MaxInt32 {
		return 0, apperr.Invalid("値 %d が範囲を超えています", v)
	}
	return int32(v), nil
}

func intPtr(v *int16) *int {
	if v == nil {
		return nil
	}
	i := int(*v)
	return &i
}

func nullDate(d *civil.Date) *time.Time {
	if d == nil {
		return nil
	}
	t := d.Time()
	return &t
}

func datePtr(t *time.Time) *civil.Date {
	if t == nil {
		return nil
	}
	d := civil.DateOf(*t)
	return &d
}

const microsecondsPerMinute = int64(time.Minute / time.Microsecond)

func timeOfDay(t civil.Time) pgtype.Time {
	return pgtype.Time{Microseconds: int64(t.Minutes()) * microsecondsPerMinute, Valid: true}
}

func parseTimeOfDay(t pgtype.Time) (civil.Time, error) {
	if !t.Valid {
		return civil.Time{}, errors.New("scan time: NULL")
	}
	m := t.Microseconds / microsecondsPerMinute
	return civil.Time{Hour: int(m / 60), Minute: int(m % 60)}, nil
}
