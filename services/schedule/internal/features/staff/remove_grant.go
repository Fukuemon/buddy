package staff

import (
	"context"
	"slices"

	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/kernel"
	"github.com/Fukuemon/buddy/services/schedule/internal/tx"
)

// RemoveGrant は、職員の権限 userPolicyID と、その対象を外す。
type RemoveGrant struct {
	staff Repository
	locks FacilityLock
	tx    tx.Transactor
	guard kernel.Guard
}

// NewRemoveGrant は RemoveGrant を作る。
func NewRemoveGrant(staff Repository, locks FacilityLock, tx tx.Transactor, guard kernel.Guard) RemoveGrant {
	return RemoveGrant{staff: staff, locks: locks, tx: tx, guard: guard}
}

// Do は、職員の権限 userPolicyID と、その対象を外す。
// 職員か、職員のその権限が見つからないときは apperr.ErrNotFound を返す。事業所で職員の管理の権限を持つ最後の有効な職員から、
// その権限を外そうとしたときは apperr.ErrConflict を返し、何も書かない。
// 休職と退職と同じく事業所をロックするので、2 人の権限を同時に外しても、権限を持つ有効な職員は残る。
// 職員の管理の権限が無いときは apperr.ErrForbidden を返す。
func (s RemoveGrant) Do(ctx context.Context, id, userPolicyID string) (Detail, error) {
	if err := s.guard(ctx); err != nil {
		return Detail{}, err
	}
	var changed Detail
	err := s.tx.WithinTx(ctx, func(ctx context.Context) error {
		cur, err := locked(ctx, s.staff, s.locks, id)
		if err != nil {
			return err
		}
		if slices.ContainsFunc(cur.Policies, func(g PolicyGrant) bool {
			return g.UserPolicyID == userPolicyID && g.PolicyCode == organization.StaffManage
		}) {
			if err := lastManager(ctx, s.staff, cur, "職員の管理の権限を持つ最後の有効な職員から、その権限は外せません"); err != nil {
				return err
			}
		}
		if err := s.staff.RemoveGrant(ctx, cur.ID, userPolicyID); err != nil {
			return err
		}
		changed, err = s.staff.Get(ctx, cur.ID)
		return err
	})
	return changed, err
}
