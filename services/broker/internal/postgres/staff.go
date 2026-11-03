package postgres

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/Fukuemon/buddy/services/broker/internal/staff"
)

// uniqueViolation は、一意の制約に反したときの PostgreSQL のエラーのコードである。
const uniqueViolation = "23505"

// StaffStore は、ブローカーの職員と上流のアカウントを読み書きする。login.Staff と internalapi.Store の約束を満たすが、
// 2 つのパッケージを import しない。
type StaffStore struct {
	pool *pgxpool.Pool
}

// NewStaffStore は、pool を使う StaffStore を作る。
func NewStaffStore(pool *pgxpool.Pool) *StaffStore {
	return &StaffStore{pool: pool}
}

const staffColumns = `s.id, s.org_id, coalesce(s.email, ''), s.status, coalesce(u.iss, ''), coalesce(u.sub, '')`

const staffFrom = ` FROM staff s LEFT JOIN upstream_accounts u ON u.staff_id = s.id`

func scanStaff(row pgx.Row) (staff.Member, error) {
	var m staff.Member
	err := row.Scan(&m.ID, &m.OrgID, &m.Email, &m.Status, &m.Upstream.Issuer, &m.Upstream.Subject)
	return m, err
}

// FindByEmail は、email（小文字にそろえた値）の職員を全ての事業所から返す。いなければ空を返す。
func (s *StaffStore) FindByEmail(ctx context.Context, email string) ([]staff.Member, error) {
	rows, err := s.pool.Query(ctx, `SELECT `+staffColumns+staffFrom+` WHERE s.email = $1 ORDER BY s.id`, email)
	if err != nil {
		return nil, fmt.Errorf("find staff by email: %w", err)
	}
	out, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (staff.Member, error) { return scanStaff(r) })
	if err != nil {
		return nil, fmt.Errorf("find staff by email: %w", err)
	}
	return out, nil
}

// Get は、ID が id の職員を返す。いなければ staff.ErrNotFound を返す。
func (s *StaffStore) Get(ctx context.Context, id string) (staff.Member, error) {
	m, err := scanStaff(s.pool.QueryRow(ctx, `SELECT `+staffColumns+staffFrom+` WHERE s.id = $1`, id))
	if errors.Is(err, pgx.ErrNoRows) {
		return staff.Member{}, staff.ErrNotFound
	}
	if err != nil {
		return staff.Member{}, fmt.Errorf("get staff: %w", err)
	}
	return m, nil
}

// Link は、有効な職員 staffID に上流のアカウント a を結び付ける。職員が既に上流のアカウントを持つか、
// a が別の職員に結び付いているか、職員が有効でないときは staff.ErrConflict を返す。
// 職員の行を FOR SHARE で読むので、同時の退職と休職を待ち、その後の状態で判断する。ログインの途中に退職した職員に、
// 上流のアカウントを結び付け直さないためである。
func (s *StaffStore) Link(ctx context.Context, staffID string, a staff.UpstreamAccount) error {
	tag, err := s.pool.Exec(ctx, `INSERT INTO upstream_accounts (staff_id, iss, sub)
SELECT s.id, $2, $3 FROM staff s WHERE s.id = $1 AND s.status = $4 FOR SHARE`, staffID, a.Issuer, a.Subject, staff.StatusActive)
	if pgErr, ok := errors.AsType[*pgconn.PgError](err); ok && pgErr.Code == uniqueViolation {
		return staff.ErrConflict
	}
	if err != nil {
		return fmt.Errorf("link upstream account: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return staff.ErrConflict
	}
	return nil
}

// Register は、m のメールの職員がいなければ m を書き、書いた職員と true を返す。メールは全ての事業所で一意である。
// m の事業所に同じメールの職員がいれば、書かずにその職員と false を返す。予定の API が登録を送り直しても、職員は 1 人だけになる。
// その職員が止められていれば staff.ErrSuspended を、ほかの事業所に同じメールの職員がいれば staff.ErrEmailTaken を返す。
func (s *StaffStore) Register(ctx context.Context, m staff.Member) (staff.Member, bool, error) {
	tag, err := s.pool.Exec(ctx, `INSERT INTO staff (id, org_id, email, status) VALUES ($1, $2, $3, $4)
ON CONFLICT ON CONSTRAINT staff_email_key DO NOTHING`, m.ID, m.OrgID, m.Email, m.Status)
	if err != nil {
		return staff.Member{}, false, fmt.Errorf("register staff: %w", err)
	}
	got, err := scanStaff(s.pool.QueryRow(ctx, `SELECT `+staffColumns+staffFrom+` WHERE s.email = $1`, m.Email))
	if err != nil {
		return staff.Member{}, false, fmt.Errorf("register staff: %w", err)
	}
	if got.OrgID != m.OrgID {
		return staff.Member{}, false, staff.ErrEmailTaken
	}
	if got.Status == staff.StatusSuspended {
		return staff.Member{}, false, staff.ErrSuspended
	}
	return got, tag.RowsAffected() == 1, nil
}

// Activate は、登録の途中の職員 id を有効にする。有効な職員を有効にしても成功する。いなければ staff.ErrNotFound を、
// 止めた職員なら staff.ErrSuspended を、退職した職員なら staff.ErrRetired を返す。
func (s *StaffStore) Activate(ctx context.Context, id string) error {
	tag, err := s.pool.Exec(ctx, `UPDATE staff SET status = $2 WHERE id = $1 AND status IN ($3, $2)`,
		id, staff.StatusActive, staff.StatusPending)
	if err != nil {
		return fmt.Errorf("activate staff: %w", err)
	}
	if tag.RowsAffected() == 1 {
		return nil
	}
	m, err := s.Get(ctx, id)
	if err != nil {
		return err
	}
	if m.Status == staff.StatusRetired {
		return staff.ErrRetired
	}
	return staff.ErrSuspended
}

// Resume は、止めた職員 id を有効に戻す。上流のアカウントの結び付けはそのまま残す。有効な職員を戻しても成功する。
// いなければ staff.ErrNotFound を、退職した職員なら staff.ErrRetired を、登録の途中の職員なら staff.ErrNotSuspended を返す。
func (s *StaffStore) Resume(ctx context.Context, id string) error {
	tag, err := s.pool.Exec(ctx, `UPDATE staff SET status = $2 WHERE id = $1 AND status IN ($3, $2)`,
		id, staff.StatusActive, staff.StatusSuspended)
	if err != nil {
		return fmt.Errorf("resume staff: %w", err)
	}
	if tag.RowsAffected() == 1 {
		return nil
	}
	m, err := s.Get(ctx, id)
	if err != nil {
		return err
	}
	if m.Status == staff.StatusRetired {
		return staff.ErrRetired
	}
	return staff.ErrNotSuspended
}

// Retire は、職員 id を退職にし、メールと上流のアカウントを消す。同じメールと上流のアカウントで、新しい職員を登録し直せる。
// 退職した職員を退職にしても成功する。いなければ staff.ErrNotFound を返す。
func (s *StaffStore) Retire(ctx context.Context, id string) error {
	return pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		tag, err := tx.Exec(ctx, `UPDATE staff SET status = $2, email = NULL WHERE id = $1`, id, staff.StatusRetired)
		if err != nil {
			return fmt.Errorf("retire staff: %w", err)
		}
		if tag.RowsAffected() == 0 {
			return staff.ErrNotFound
		}
		if _, err := tx.Exec(ctx, `DELETE FROM upstream_accounts WHERE staff_id = $1`, id); err != nil {
			return fmt.Errorf("retire staff: %w", err)
		}
		return nil
	})
}

// Delete は、登録の途中で上流のアカウントを結び付けていない職員 id を消す。いなければ staff.ErrNotFound を、
// 有効か止めた職員なら staff.ErrNotPending を返す。
func (s *StaffStore) Delete(ctx context.Context, id string) error {
	tag, err := s.pool.Exec(ctx, `DELETE FROM staff s WHERE s.id = $1 AND s.status = $2
AND NOT EXISTS (SELECT 1 FROM upstream_accounts u WHERE u.staff_id = s.id)`, id, staff.StatusPending)
	if err != nil {
		return fmt.Errorf("delete staff: %w", err)
	}
	if tag.RowsAffected() == 1 {
		return nil
	}
	if _, err := s.Get(ctx, id); err != nil {
		return err
	}
	return staff.ErrNotPending
}

// Suspend は、職員 id を止める。止めた職員を止めても成功する。いなければ staff.ErrNotFound を、
// 退職した職員なら staff.ErrRetired を返す。
func (s *StaffStore) Suspend(ctx context.Context, id string) error {
	tag, err := s.pool.Exec(ctx, `UPDATE staff SET status = $2 WHERE id = $1 AND status <> $3`,
		id, staff.StatusSuspended, staff.StatusRetired)
	if err != nil {
		return fmt.Errorf("suspend staff: %w", err)
	}
	if tag.RowsAffected() == 1 {
		return nil
	}
	if _, err := s.Get(ctx, id); err != nil {
		return err
	}
	return staff.ErrRetired
}
