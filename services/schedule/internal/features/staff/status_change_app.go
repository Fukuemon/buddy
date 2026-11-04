package staff

import (
	"context"
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/tx"
)

// StatusChange は、休職か退職にした職員と、その日以降に残る予定と担当の利用者である。
type StatusChange struct {
	Staff       Detail
	Assignments Assignments
}

// remaining は、職員 cur の、今日（事業所の現地の日付）以降の予定、繰り返しの予定、担当の利用者を返す。
// 休職、退職、訪問しない職員への変更、RemainingAssignments が同じ一覧を返すよう、全てこれで作る。
func remaining(ctx context.Context, assignments AssignmentReader, now func() time.Time, cur Detail) (Assignments, error) {
	return assignments.From(ctx, cur.FacilityID, cur.ID, civil.Today(now()))
}

// stop は、休職と退職に共通の確認をしてから、事業所をロックしたトランザクションの中で、読み直した職員で write を呼ぶ。
// 自分と、事業所で職員の管理の権限を持つ最後の有効な職員は、apperr.ErrConflict で拒む。
// 事業所のロックで、同じ事業所の休職と退職を 1 つずつにし、管理者どうしが同時に休職にし合って有効な管理者がいなくなるのを防ぐ。
func stop(ctx context.Context, guard organization.Guard, self func(ctx context.Context) (string, bool), tx tx.Transactor, staff Repository, locks FacilityLock, id string, write func(ctx context.Context, cur Detail) error) error {
	if err := guard(ctx); err != nil {
		return err
	}
	if self != nil {
		if selfID, ok := self(ctx); ok && selfID == id {
			return apperr.Conflict("自分を休職か退職にすることはできません")
		}
	}
	return tx.WithinTx(ctx, func(ctx context.Context) error {
		cur, err := locked(ctx, staff, locks, id)
		if err != nil {
			return err
		}
		if err := lastManager(ctx, staff, cur, "職員の管理の権限を持つ最後の有効な職員は、休職と退職にできません"); err != nil {
			return err
		}
		return write(ctx, cur)
	})
}
