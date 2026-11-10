package staff

import (
	"context"
	"errors"
	"fmt"
	"slices"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/audit"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/kernel"
	"github.com/Fukuemon/buddy/services/schedule/internal/tx"
)

// ChangePosition は、職員の役職を positionID にし、前の役職のデフォルトの権限を新しい役職のデフォルトの権限に置き換える。
type ChangePosition struct {
	staff     Repository
	locks     FacilityLock
	positions kernel.Finder[organization.Position]
	audit     audit.Recorder
	tx        tx.Transactor
	ids       kernel.IDGenerator
	guard     kernel.Guard
}

// NewChangePosition は ChangePosition を作る。
func NewChangePosition(staff Repository, locks FacilityLock, positions kernel.Finder[organization.Position], audit audit.Recorder, tx tx.Transactor, ids kernel.IDGenerator, guard kernel.Guard) ChangePosition {
	return ChangePosition{staff: staff, locks: locks, positions: positions, audit: audit, tx: tx, ids: ids, guard: guard}
}

// Do は、職員の役職を positionID にし、ADR-0041 のとおり、前の役職のデフォルトにある権限を対象ごと消して、新しい役職のデフォルトの権限をコピーする。
// 前の役職のデフォルトに無い権限は、職員ごとに足した権限として対象ごと残し、新しい役職のデフォルトにもあればコピーしない。
// 今と同じ役職に変えたときは、何も書かずに今の職員を返す。
// 職員が見つからないときは apperr.ErrNotFound を、役職が見つからないか別の事業所のものであるときは入力のエラーを返す。
// 職員の今の役職が見つからないときは、データの不整合として、apperr のどのエラーにも当たらない内部のエラーを返す。
// 事業所で職員の管理の権限を持つ最後の有効な職員が、変更の後にその権限を持たなくなるときは apperr.ErrConflict を返し、何も書かない。
// 休職と退職と同じく事業所をロックするので、同時に役職を変えても、権限を持つ有効な職員は残る。
// 職員の管理の権限が無いときは apperr.ErrForbidden を返す。
// 同じトランザクションで、変更の前と、変更の後に読み直した権限を監査の記録に書き、書けなければ役職も変えない（ADR-0042）。
func (s ChangePosition) Do(ctx context.Context, id, positionID string) (Detail, error) {
	if err := s.guard(ctx); err != nil {
		return Detail{}, err
	}
	var changed Detail
	err := s.tx.WithinTx(ctx, func(ctx context.Context) error {
		cur, err := locked(ctx, s.staff, s.locks, id)
		if err != nil {
			return err
		}
		if cur.PositionID == positionID {
			changed = cur
			return nil
		}
		before := toStaffState(cur)
		pos, err := s.positions.Get(ctx, positionID)
		if err != nil {
			return apperr.Reference("役職", positionID, err)
		}
		if err := organization.RequireSameFacility("役職", pos.ID, pos.FacilityID, cur.FacilityID); err != nil {
			return err
		}
		from, err := s.positions.Get(ctx, cur.PositionID)
		if errors.Is(err, apperr.ErrNotFound) {
			// 職員の役職は外部キーで役職を指すので、見つからないのはデータの不整合である。職員が見つからない 404 と読まれないよう、内部のエラーにする。
			return fmt.Errorf("職員 %s の今の役職 %s が見つかりません", cur.ID, cur.PositionID)
		}
		if err != nil {
			return err
		}
		dropPolicyIDs, grants, manages := replaceGrants(cur.Policies, from, pos, cur.TeamID, s.ids)
		if !manages {
			if err := lastManager(ctx, s.staff, cur, "職員の管理の権限を持つ最後の有効な職員の役職は、その権限を持たない役職に変えられません"); err != nil {
				return err
			}
		}
		if err := s.staff.ChangePosition(ctx, cur.ID, pos.ID, dropPolicyIDs, grants); err != nil {
			return err
		}
		changed, err = s.staff.Get(ctx, cur.ID)
		if err != nil {
			return err
		}
		return recordChange(ctx, s.audit, audit.PositionChange, &before, changed)
	})
	return changed, err
}

// replaceGrants は、権限 cur を持つチーム teamID の職員の役職を from から to に変えるときに、消す権限の ID、コピーする権限、
// 変更の後に職員の管理の権限が残るかを返す。消すのは from のデフォルトの権限で、cur のうちそれ以外は残す。
// 残す権限が to のデフォルトにもあれば、コピーしない。
func replaceGrants(cur []PolicyGrant, from, to organization.Position, teamID string, ids kernel.IDGenerator) (dropPolicyIDs []string, grants []Grant, manages bool) {
	for _, p := range from.Policies {
		dropPolicyIDs = append(dropPolicyIDs, p.ID)
	}
	var keptPolicyIDs []string
	for _, g := range cur {
		if !slices.Contains(dropPolicyIDs, g.PolicyID) {
			keptPolicyIDs = append(keptPolicyIDs, g.PolicyID)
			manages = manages || g.PolicyCode == organization.StaffManage
		}
	}
	to.Policies = slices.DeleteFunc(slices.Clone(to.Policies), func(p organization.Policy) bool { return slices.Contains(keptPolicyIDs, p.ID) })
	for _, p := range to.Policies {
		manages = manages || p.Code == organization.StaffManage
	}
	return dropPolicyIDs, DefaultGrants(to, teamID, ids), manages
}
