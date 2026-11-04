package staff

import (
	"context"
	"slices"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/kernel"
	"github.com/Fukuemon/buddy/services/schedule/internal/tx"
)

// ChangePosition は、職員の役職を positionID にし、職員の権限を新しい役職のデフォルトの権限からコピーし直す。
type ChangePosition struct {
	staff     Repository
	positions kernel.Finder[organization.Position]
	tx        tx.Transactor
	ids       kernel.IDGenerator
	guard     organization.Guard
}

// NewChangePosition は ChangePosition を作る。
func NewChangePosition(staff Repository, positions kernel.Finder[organization.Position], tx tx.Transactor, ids kernel.IDGenerator, guard organization.Guard) ChangePosition {
	return ChangePosition{staff: staff, positions: positions, tx: tx, ids: ids, guard: guard}
}

// Do は、職員の役職を positionID にし、職員の権限を新しい役職のデフォルトの権限からコピーし直す。
// ADR-0002 のとおり、職員ごとに足した権限と対象は消える。職員が見つからないときは apperr.ErrNotFound を、
// 役職が見つからないか別の事業所のものであるときは入力のエラーを返す。事業所で職員の管理の権限を持つ最後の有効な職員の役職を、
// その権限を持たない役職に変えようとしたときは apperr.ErrConflict を返し、何も書かない。
// 休職と退職と同じく事業所をロックするので、同時に役職を変えても、権限を持つ有効な職員は残る。
// 職員の管理の権限が無いときは apperr.ErrForbidden を返す。
func (s ChangePosition) Do(ctx context.Context, id, positionID string) (Detail, error) {
	if err := s.guard(ctx); err != nil {
		return Detail{}, err
	}
	var changed Detail
	err := s.tx.WithinTx(ctx, func(ctx context.Context) error {
		cur, err := locked(ctx, s.staff, id)
		if err != nil {
			return err
		}
		pos, err := s.positions.Get(ctx, positionID)
		if err != nil {
			return apperr.Reference("役職", positionID, err)
		}
		if err := apperr.SameFacility("役職", pos.ID, pos.FacilityID, cur.FacilityID); err != nil {
			return err
		}
		if !slices.ContainsFunc(pos.Policies, func(p organization.Policy) bool { return p.Code == organization.StaffManage }) {
			if err := lastManager(ctx, s.staff, cur, "職員の管理の権限を持つ最後の有効な職員の役職は、その権限を持たない役職に変えられません"); err != nil {
				return err
			}
		}
		if err := s.staff.ChangePosition(ctx, cur.ID, pos.ID, DefaultGrants(pos, cur.TeamID, s.ids)); err != nil {
			return err
		}
		changed, err = s.staff.Get(ctx, cur.ID)
		return err
	})
	return changed, err
}
