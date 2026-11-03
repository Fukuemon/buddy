package staff

import (
	"context"
	"errors"
	"fmt"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
)

// Retire は、職員を退職にし、名前、所属、役職を残してメールと電話番号を消し、職員の外部のカレンダーを外す。
// カレンダーのレコードと予定の対応は残す。その日以降の予定、繰り返しの予定、担当の利用者が
// 残れば、書かずに残る一覧を持つ *AssignedError を返す。退職した職員を退職にしても成功する。職員が見つからないときは
// apperr.ErrNotFound を、職員の管理の権限が無いときは apperr.ErrForbidden を、自分か、事業所で職員の管理の権限を持つ
// 最後の有効な職員を退職にしようとしたときは apperr.ErrConflict を返す。
//
// 2 か所の書き込みは Leave と同じく、事業所をロックしたトランザクションの中で、ブローカーの職員を先に退職にしてからここで書く。
// ブローカーは退職でメールと上流のアカウントを消すので、ここで書けずにロールバックしても、職員はログインできない。送り直すと書く。
func (s *App) Retire(ctx context.Context, id string) (StatusChange, error) {
	var out StatusChange
	var revokeErr error
	err := s.stop(ctx, id, func(ctx context.Context, cur Detail) error {
		a, err := s.remaining(ctx, cur)
		if err != nil {
			return err
		}
		if !a.IsEmpty() {
			return &AssignedError{Assignments: a}
		}
		if cur.Sub != nil {
			switch err := s.deps.Identities.Retire(ctx, *cur.Sub); {
			case errors.Is(err, apperr.ErrNotFound):
				// ブローカーにいない職員はログインできないので、ここでだけ退職にする
			case errors.Is(err, ErrRevokeFailed):
				revokeErr = err
			case err != nil:
				return err
			}
		}
		if err := s.deps.Staff.Retire(ctx, cur.ID); err != nil {
			return err
		}
		if err := s.deps.Calendars.DetachByStaff(ctx, cur.ID); err != nil {
			return err
		}
		out.Staff, err = s.deps.Staff.Get(ctx, cur.ID)
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
