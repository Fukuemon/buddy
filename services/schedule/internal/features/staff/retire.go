package staff

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/tx"
)

// Retire は、職員を退職にし、名前、所属、役職を残してメールと電話番号を消し、職員の外部のカレンダーを外す。
type Retire struct {
	self        func(ctx context.Context) (string, bool)
	staff       Repository
	locks       FacilityLock
	assignments AssignmentReader
	now         func() time.Time
	identities  Identities
	calendars   CalendarDetacher
	tx          tx.Transactor
	guard       organization.Guard
}

// NewRetire は Retire を作る。self は、ctx のリクエストを送った職員の ID を返し、職員が自分を休職か退職にするのを拒むのに使う。nil なら拒まない。
// now は、残る予定を数え始める日を決める時刻である。nil なら time.Now を使う。
func NewRetire(self func(ctx context.Context) (string, bool), staff Repository, locks FacilityLock, assignments AssignmentReader, now func() time.Time, identities Identities, calendars CalendarDetacher, tx tx.Transactor, guard organization.Guard) Retire {
	if now == nil {
		now = time.Now
	}
	return Retire{self: self, staff: staff, locks: locks, assignments: assignments, now: now, identities: identities, calendars: calendars, tx: tx, guard: guard}
}

// Do は、職員を退職にし、名前、所属、役職を残してメールと電話番号を消し、職員の外部のカレンダーを外す。
// カレンダーのレコードと予定の対応は残す。その日以降の予定、繰り返しの予定、担当の利用者が
// 残れば、書かずに残る一覧を持つ *AssignedError を返す。退職した職員を退職にしても成功する。職員が見つからないときは
// apperr.ErrNotFound を、職員の管理の権限が無いときは apperr.ErrForbidden を、自分か、事業所で職員の管理の権限を持つ
// 最後の有効な職員を退職にしようとしたときは apperr.ErrConflict を返す。
//
// 2 か所の書き込みは Leave と同じく、事業所をロックしたトランザクションの中で、ブローカーの職員を先に退職にしてからここで書く。
// ブローカーは退職でメールと上流のアカウントを消すので、ここで書けずにロールバックしても、職員はログインできない。送り直すと書く。
func (s Retire) Do(ctx context.Context, id string) (StatusChange, error) {
	var out StatusChange
	var revokeErr error
	err := stop(ctx, s.guard, s.self, s.tx, s.staff, s.locks, id, func(ctx context.Context, cur Detail) error {
		a, err := remaining(ctx, s.assignments, s.now, cur)
		if err != nil {
			return err
		}
		if !a.IsEmpty() {
			return &AssignedError{Assignments: a}
		}
		if cur.Sub != nil {
			switch err := s.identities.Retire(ctx, *cur.Sub); {
			case errors.Is(err, apperr.ErrNotFound):
				// ブローカーにいない職員はログインできないので、ここでだけ退職にする
			case errors.Is(err, ErrRevokeFailed):
				revokeErr = err
			case err != nil:
				return err
			}
		}
		if err := s.staff.Retire(ctx, cur.ID); err != nil {
			return err
		}
		if err := s.calendars.DetachByStaff(ctx, cur.ID); err != nil {
			return err
		}
		out.Staff, err = s.staff.Get(ctx, cur.ID)
		return err
	})
	if err != nil {
		return StatusChange{}, err
	}
	if revokeErr != nil {
		return StatusChange{}, fmt.Errorf("職員を退職にしましたが、ログインの取り消しに失敗しました。もう一度退職にしてください: %w", revokeErr)
	}
	return out, nil
}
