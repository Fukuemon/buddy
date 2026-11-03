package staff

import (
	"context"
	"slices"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
)

// ChangePosition は、職員の役職を positionID にし、職員の権限を新しい役職のデフォルトの権限からコピーし直す。
// ADR-0002 のとおり、職員ごとに足した権限と対象は消える。職員が見つからないときは apperr.ErrNotFound を、
// 役職が見つからないか別の事業所のものであるときは入力のエラーを返す。事業所で職員の管理の権限を持つ最後の有効な職員の役職を、
// その権限を持たない役職に変えようとしたときは apperr.ErrConflict を返し、何も書かない。
// 休職と退職と同じく事業所をロックするので、同時に役職を変えても、権限を持つ有効な職員は残る。
func (s *Usecase) ChangePosition(ctx context.Context, id, positionID string) (Detail, error) {
	if err := s.guard(ctx); err != nil {
		return Detail{}, err
	}
	var changed Detail
	err := s.tx.WithinTx(ctx, func(ctx context.Context) error {
		cur, err := s.locked(ctx, id)
		if err != nil {
			return err
		}
		pos, err := s.deps.Positions.Get(ctx, positionID)
		if err != nil {
			return apperr.Reference("役職", positionID, err)
		}
		if err := apperr.SameFacility("役職", pos.ID, pos.FacilityID, cur.FacilityID); err != nil {
			return err
		}
		if !slices.ContainsFunc(pos.Policies, func(p organization.Policy) bool { return p.Code == organization.StaffManage }) {
			if err := s.lastManager(ctx, cur, "職員の管理の権限を持つ最後の有効な職員の役職は、その権限を持たない役職に変えられません"); err != nil {
				return err
			}
		}
		if err := s.deps.Staff.ChangePosition(ctx, cur.ID, pos.ID, DefaultGrants(pos, cur.TeamID, s.ids)); err != nil {
			return err
		}
		changed, err = s.deps.Staff.Get(ctx, cur.ID)
		return err
	})
	return changed, err
}
