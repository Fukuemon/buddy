package postgres

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/Fukuemon/buddy/services/broker/internal/internalapi"
	"github.com/Fukuemon/buddy/services/broker/internal/login"
)

// uniqueViolation は、一意の制約に反したときの PostgreSQL のエラーのコードである。
const uniqueViolation = "23505"

// StaffStore は、ブローカーの職員と上流のアカウントを読み書きする。login.Staff と internalapi.Store の約束を満たす。
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

// Register は、m のメールの職員がいなければ m を書き、書いた職員と true を返す。メールは全ての事業所で一意である。
// m の事業所に同じメールの職員がいれば、書かずにその職員と false を返す。予定の API が登録を送り直しても、職員は 1 人だけになる。
// ほかの事業所に同じメールの職員がいれば internalapi.ErrEmailTaken を返す。
func (s *StaffStore) Register(ctx context.Context, m login.StaffMember) (login.StaffMember, bool, error) {
	tag, err := s.pool.Exec(ctx, `INSERT INTO staff (id, org_id, email, status) VALUES ($1, $2, $3, $4)
ON CONFLICT ON CONSTRAINT staff_email_key DO NOTHING`, m.ID, m.OrgID, m.Email, m.Status)
	if err != nil {
		return login.StaffMember{}, false, fmt.Errorf("register staff: %w", err)
	}
	got, err := scanStaff(s.pool.QueryRow(ctx, `SELECT `+staffColumns+staffFrom+` WHERE s.email = $1`, m.Email))
	if err != nil {
		return login.StaffMember{}, false, fmt.Errorf("register staff: %w", err)
	}
	if got.OrgID != m.OrgID {
		return login.StaffMember{}, false, internalapi.ErrEmailTaken
	}
	return got, tag.RowsAffected() == 1, nil
}

// Activate は、登録の途中の職員 id を有効にする。有効な職員を有効にしても成功する。いなければ login.ErrNotFound を、
// 止めた職員なら internalapi.ErrSuspended を返す。
func (s *StaffStore) Activate(ctx context.Context, id string) error {
	tag, err := s.pool.Exec(ctx, `UPDATE staff SET status = $2 WHERE id = $1 AND status IN ($3, $2)`,
		id, login.StatusActive, login.StatusPending)
	if err != nil {
		return fmt.Errorf("activate staff: %w", err)
	}
	if tag.RowsAffected() == 1 {
		return nil
	}
	if _, err := s.Get(ctx, id); err != nil {
		return err
	}
	return internalapi.ErrSuspended
}

// Delete は、登録の途中で上流のアカウントを結び付けていない職員 id を消す。いなければ login.ErrNotFound を、
// 有効か止めた職員なら internalapi.ErrNotPending を返す。
func (s *StaffStore) Delete(ctx context.Context, id string) error {
	tag, err := s.pool.Exec(ctx, `DELETE FROM staff s WHERE s.id = $1 AND s.status = $2
AND NOT EXISTS (SELECT 1 FROM upstream_accounts u WHERE u.staff_id = s.id)`, id, login.StatusPending)
	if err != nil {
		return fmt.Errorf("delete staff: %w", err)
	}
	if tag.RowsAffected() == 1 {
		return nil
	}
	if _, err := s.Get(ctx, id); err != nil {
		return err
	}
	return internalapi.ErrNotPending
}

// Suspend は、職員 id を止める。止めた職員を止めても成功する。いなければ login.ErrNotFound を返す。
func (s *StaffStore) Suspend(ctx context.Context, id string) error {
	tag, err := s.pool.Exec(ctx, `UPDATE staff SET status = $2 WHERE id = $1`, id, login.StatusSuspended)
	if err != nil {
		return fmt.Errorf("suspend staff: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return login.ErrNotFound
	}
	return nil
}
