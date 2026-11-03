package organization

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
)

// CreatePosition は、事業所に役職を作り、保存した役職を返す。policyIDs に見つからない権限があると入力のエラーを、職員の管理の権限が無いときは apperr.ErrForbidden を、
// 同じ事業所に同じ名前の役職があるときは apperr.ErrConflict を返す。
func (o *Usecase) CreatePosition(ctx context.Context, facilityID, name string, policyIDs []string) (Position, error) {
	if err := o.guard(ctx); err != nil {
		return Position{}, err
	}
	if _, err := o.deps.Facilities.Get(ctx, facilityID); err != nil {
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
func (o *Usecase) requirePolicies(ctx context.Context, ids []string) ([]Policy, error) {
	policies, err := o.deps.Policies.ListByIDs(ctx, ids)
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
func (o *Usecase) savePosition(ctx context.Context, p Position) (Position, error) {
	var created Position
	err := o.tx.WithinTx(ctx, func(ctx context.Context) error {
		if err := o.deps.Positions.Create(ctx, p); err != nil {
			return apperr.AsConflict(err, "役職 %s はこの事業所にすでにあります", p.Name)
		}
		var err error
		created, err = o.deps.Positions.Get(ctx, p.ID)
		return err
	})
	return created, err
}
