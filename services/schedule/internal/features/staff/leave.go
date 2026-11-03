package staff

import (
	"context"
	"errors"
	"fmt"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
)

// LeaveInput は、職員を休職にする入力である。ReturnDate は戻る予定の日のメモで、nil なら持たない。
type LeaveInput struct {
	ReturnDate *civil.Date
}

// Leave は、職員を休職にし、休職にした職員と、その日以降に残る予定と担当の利用者を返す。残る予定があっても拒まない。
// 休職の職員を休職にし直すと、戻る予定の日だけを書き換える。職員が見つからないときは apperr.ErrNotFound を、
// 職員の管理の権限が無いときは apperr.ErrForbidden を、自分か、事業所で職員の管理の権限を持つ最後の有効な職員か、
// 退職した職員を休職にしようとしたときは apperr.ErrConflict を返す。
//
// 事業所をロックしたトランザクションの中で、ブローカーの職員を先に止めてから、ここで休職を書く。ここで書けなければ、
// ブローカーで止めたままロールバックするので、送り直すとブローカーの停止をやり直してから書く。止めたままの間も、職員はログインできない。
// ブローカーが止めた後に Hydra の取り消しに失敗したときも、ここで休職を書いてからエラーを返し、送り直しで取り消しをやり直させる。
// ブローカーの職員の ID が無いか、ブローカーにいない職員はログインできないので、ここでだけ休職にする。
func (s *Usecase) Leave(ctx context.Context, id string, in LeaveInput) (StatusChange, error) {
	var out StatusChange
	var revokeErr error
	err := s.stop(ctx, id, func(ctx context.Context, cur Detail) error {
		if err := cur.RequireLeavable(); err != nil {
			return err
		}
		a, err := s.remaining(ctx, cur)
		if err != nil {
			return err
		}
		if cur.Sub != nil {
			switch err := s.deps.Identities.Suspend(ctx, *cur.Sub); {
			case errors.Is(err, apperr.ErrNotFound):
				// ブローカーにいない職員はログインできないので、ここでだけ休職にする
			case errors.Is(err, ErrIdentityRetired):
				return apperr.Conflict("職員はブローカーで退職しています。退職をやり直してください")
			case errors.Is(err, ErrRevokeFailed):
				revokeErr = err
			case err != nil:
				return err
			}
		}
		if err := s.deps.Staff.StartLeave(ctx, cur.ID, in.ReturnDate); err != nil {
			return err
		}
		out.Assignments = a
		out.Staff, err = s.deps.Staff.Get(ctx, cur.ID)
		return err
	})
	if err != nil {
		return StatusChange{}, err
	}
	if revokeErr != nil {
		return StatusChange{}, fmt.Errorf("職員を休職にしましたが、ログインの取り消しに失敗しました。もう一度休職にしてください: %w", revokeErr)
	}
	return out, nil
}
