package postgres

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/Fukuemon/buddy/services/broker/internal/login"
)

// uniqueViolation は、一意の制約に反したときの PostgreSQL のエラーのコードである。
const uniqueViolation = "23505"

// StaffStore は、ブローカーの職員と上流のアカウントを読み書きする。login.Staff の約束を満たす。
type StaffStore struct {
	pool *pgxpool.Pool
}

// NewStaffStore は、pool を使う StaffStore を作る。
func NewStaffStore(pool *pgxpool.Pool) *StaffStore {
	return &StaffStore{pool: pool}
}

const staffColumns = `s.id, s.org_id, s.email, s.status, coalesce(u.iss, ''), coalesce(u.sub, '')`

const staffFrom = ` FROM staff s LEFT JOIN upstream_accounts u ON u.staff_id = s.id`

func scanStaff(row pgx.Row) (login.StaffMember, error) {
	var m login.StaffMember
	err := row.Scan(&m.ID, &m.OrgID, &m.Email, &m.Status, &m.Upstream.Issuer, &m.Upstream.Subject)
	return m, err
}

// FindByEmail は、email（小文字にそろえた値）の職員を全ての事業所から返す。いなければ空を返す。
func (s *StaffStore) FindByEmail(ctx context.Context, email string) ([]login.StaffMember, error) {
	rows, err := s.pool.Query(ctx, `SELECT `+staffColumns+staffFrom+` WHERE s.email = $1 ORDER BY s.id`, email)
	if err != nil {
		return nil, fmt.Errorf("find staff by email: %w", err)
	}
	out, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (login.StaffMember, error) { return scanStaff(r) })
	if err != nil {
		return nil, fmt.Errorf("find staff by email: %w", err)
	}
	return out, nil
}

// Get は、ID が id の職員を返す。いなければ login.ErrNotFound を返す。
func (s *StaffStore) Get(ctx context.Context, id string) (login.StaffMember, error) {
	m, err := scanStaff(s.pool.QueryRow(ctx, `SELECT `+staffColumns+staffFrom+` WHERE s.id = $1`, id))
	if errors.Is(err, pgx.ErrNoRows) {
		return login.StaffMember{}, login.ErrNotFound
	}
	if err != nil {
		return login.StaffMember{}, fmt.Errorf("get staff: %w", err)
	}
	return m, nil
}

// Link は、職員 staffID に上流のアカウント a を結び付ける。職員が既に上流のアカウントを持つか、
// a が別の職員に結び付いているときは login.ErrConflict を返す。
func (s *StaffStore) Link(ctx context.Context, staffID string, a login.UpstreamAccount) error {
	_, err := s.pool.Exec(ctx, `INSERT INTO upstream_accounts (staff_id, iss, sub) VALUES ($1, $2, $3)`, staffID, a.Issuer, a.Subject)
	if pgErr, ok := errors.AsType[*pgconn.PgError](err); ok && pgErr.Code == uniqueViolation {
		return login.ErrConflict
	}
	if err != nil {
		return fmt.Errorf("link upstream account: %w", err)
	}
	return nil
}
