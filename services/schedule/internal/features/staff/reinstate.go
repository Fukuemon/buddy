package staff

import (
	"context"
	"errors"
	"fmt"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
)

// Reinstate は、休職の職員を有効に戻し（復職）、戻した職員を返す。有効な職員を戻しても成功する。職員が見つからないときは
// apperr.ErrNotFound を、職員の管理の権限が無いときは apperr.ErrForbidden を、退職した職員を戻そうとしたときは apperr.ErrConflict を返す。
//
// 休職と逆に、ここで休職を外してコミットしてから、ブローカーの職員を有効に戻す。ログインできるようにする書き込みを最後にし、
// 片方だけが書けたときに、ログインできる職員が予定の API で休職のまま残らないようにする。
// ブローカーを呼ぶ 2 つ目のトランザクションは、事業所をロックして職員を読み直し、有効なままのときだけ呼ぶ。
// 1 つ目のコミットの後に休職にし直されていれば、ブローカーの職員を戻さない。ブローカーが戻したときは 2 つ目でここに書かないので、
// ブローカーが戻した後にコミットに失敗しても、状態は食い違わない。
// ブローカーが退職か、止めていない職員と答えたときは、外した休職を書き戻して apperr.ErrConflict を返す。
// ブローカーに届かなかったときは、外した休職を残してエラーを返す。その間、職員はブローカーで止めたままなのでログインできない。
// 送り直すと、ブローカーの職員を戻し直す。
func (s *Usecase) Reinstate(ctx context.Context, id string) (Detail, error) {
	if err := s.guard(ctx); err != nil {
		return Detail{}, err
	}
	var before Detail
	err := s.tx.WithinTx(ctx, func(ctx context.Context) error {
		var err error
		before, err = s.locked(ctx, id)
		if err != nil {
			return err
		}
		if err := before.RequireReinstatable(); err != nil {
			return err
		}
		return s.deps.Staff.EndLeave(ctx, before.ID)
	})
	if err != nil {
		return Detail{}, err
	}
	var brokerErr error
	err = s.tx.WithinTx(ctx, func(ctx context.Context) error {
		cur, err := s.locked(ctx, id)
		if err != nil {
			return err
		}
		if cur.Status() != StatusActive {
			return apperr.Conflict("復職の途中に、職員がほかの操作で休職か退職になりました")
		}
		if cur.Sub == nil {
			return nil
		}
		switch err := s.deps.Identities.Resume(ctx, *cur.Sub); {
		case err == nil, errors.Is(err, apperr.ErrNotFound):
			// ブローカーにいない職員はログインできないので、ここでだけ戻す
		case errors.Is(err, ErrIdentityRetired):
			brokerErr = apperr.Conflict("職員はブローカーで退職しています。退職をやり直してください")
		case errors.Is(err, apperr.ErrConflict):
			brokerErr = apperr.Conflict("ブローカーの職員は休職していないので、復職できません")
		default:
			return fmt.Errorf("休職を外しましたが、ブローカーの職員を戻せませんでした。もう一度復職にしてください: %w", err)
		}
		if brokerErr != nil && before.Status() == StatusOnLeave {
			return s.deps.Staff.StartLeave(ctx, cur.ID, before.LeaveReturnDate)
		}
		return nil
	})
	if err != nil {
		return Detail{}, err
	}
	if brokerErr != nil {
		return Detail{}, brokerErr
	}
	return s.deps.Staff.Get(ctx, id)
}
