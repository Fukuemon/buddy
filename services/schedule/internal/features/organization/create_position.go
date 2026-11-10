package organization

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/audit"
	"github.com/Fukuemon/buddy/services/schedule/internal/kernel"
	"github.com/Fukuemon/buddy/services/schedule/internal/tx"
)

// CreatePosition は、事業所に役職を作り、保存した役職を返す。
type CreatePosition struct {
	facilities FacilityRepository
	policies   PolicyRepository
	positions  PositionRepository
	audit      audit.Recorder
	tx         tx.Transactor
	ids        kernel.IDGenerator
	guard      kernel.Guard
}

// NewCreatePosition は CreatePosition を作る。
func NewCreatePosition(facilities FacilityRepository, policies PolicyRepository, positions PositionRepository, rec audit.Recorder, tx tx.Transactor, ids kernel.IDGenerator, guard kernel.Guard) CreatePosition {
	return CreatePosition{facilities: facilities, policies: policies, positions: positions, audit: rec, tx: tx, ids: ids, guard: guard}
}

// Do は、事業所に役職を作り、保存した役職を返す。policyIDs に見つからない権限があると入力のエラーを、職員の管理の権限が無いときは apperr.ErrForbidden を、
// 同じ事業所に同じ名前の役職があるときは apperr.ErrConflict を返す。
// 役職を書くトランザクションで、役職の名前とデフォルトの権限を監査の記録に書き、書けなければ役職も作らない（ADR-0042）。
func (o CreatePosition) Do(ctx context.Context, facilityID, name string, policyIDs []string) (Position, error) {
	if err := o.guard(ctx); err != nil {
		return Position{}, err
	}
	if _, err := o.facilities.Get(ctx, facilityID); err != nil {
		return Position{}, err
	}
	policies, err := o.requirePolicies(ctx, policyIDs)
	if err != nil {
		return Position{}, err
	}
	p, err := NewPosition(o.ids.NewID(), facilityID, name, policies)
	if err != nil {
		return Position{}, err
	}
	return o.savePosition(ctx, p)
}

// requirePolicies は、ids の全ての権限を返す。見つからない権限が 1 つでもあれば、その ID を書いた入力のエラーを返す。
func (o CreatePosition) requirePolicies(ctx context.Context, ids []string) ([]Policy, error) {
	policies, err := o.policies.ListByIDs(ctx, ids)
	if err != nil {
		return nil, err
	}
	found := make(map[string]bool, len(policies))
	for _, p := range policies {
		found[p.ID] = true
	}
	for _, id := range ids {
		if !found[id] {
			return nil, apperr.Invalid("権限 %s が見つかりません", id)
		}
	}
	return policies, nil
}

// savePosition は、1 つのトランザクションで役職 p を保存して読み直す。同じ事業所に同じ名前の役職があるときは apperr.ErrConflict を返す。
func (o CreatePosition) savePosition(ctx context.Context, p Position) (Position, error) {
	var created Position
	err := o.tx.WithinTx(ctx, func(ctx context.Context) error {
		if err := o.positions.Create(ctx, p); err != nil {
			return apperr.AsConflict(err, "役職 %s はこの事業所にすでにあります", p.Name)
		}
		var err error
		created, err = o.positions.Get(ctx, p.ID)
		if err != nil {
			return err
		}
		codes := make([]string, 0, len(created.Policies))
		for _, pol := range created.Policies {
			codes = append(codes, string(pol.Code))
		}
		return o.audit.ByStaff(ctx, audit.Entry{
			FacilityID: created.FacilityID, Action: audit.PositionCreate, TargetPositionID: created.ID,
			After: audit.NewPositionState(created.Name, codes),
		})
	})
	return created, err
}
