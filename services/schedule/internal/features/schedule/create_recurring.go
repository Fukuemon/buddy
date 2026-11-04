package schedule

import (
	"context"
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/kernel"
	"github.com/Fukuemon/buddy/services/schedule/internal/tx"
)

// CreateRecurring は、事業所に繰り返しの予定を作る。
type CreateRecurring struct {
	facilities kernel.Finder[organization.Facility]
	types      TypeRepository
	staff      StaffRefs
	visits     VisitInfos
	now        func() time.Time
	recurring  RecurringRepository
	exports    Exports
	tx         tx.Transactor
	ids        kernel.IDGenerator
}

// NewCreateRecurring は CreateRecurring を作る。exports は、予定の変更を外部のカレンダーへの書き出しの待ちに積む。nil なら積まない。
// now は、退職した職員を割り振ったまま保存できる予定の日付を決める時刻である。nil なら time.Now を使う。
func NewCreateRecurring(facilities kernel.Finder[organization.Facility], types TypeRepository, staff StaffRefs, visits VisitInfos, now func() time.Time, recurring RecurringRepository, exports Exports, tx tx.Transactor, ids kernel.IDGenerator) CreateRecurring {
	if now == nil {
		now = time.Now
	}
	return CreateRecurring{facilities: facilities, types: types, staff: staff, visits: visits, now: now, recurring: recurring, exports: exports, tx: tx, ids: ids}
}

// Do は、事業所に繰り返しの予定を作る。エラーは Create と同じである。
func (s CreateRecurring) Do(ctx context.Context, facilityID string, in SlotInput, rule RuleInput) (RecurringDetail, error) {
	if _, err := s.facilities.Get(ctx, facilityID); err != nil {
		return RecurringDetail{}, err
	}
	r, err := NewRule(Rule(rule))
	if err != nil {
		return RecurringDetail{}, err
	}
	var created RecurringDetail
	err = s.tx.WithinTx(ctx, func(ctx context.Context) error {
		slot, typ, err := prepareSlot(ctx, s.types, s.staff, s.visits, s.now, facilityID, in, assignment{})
		if err != nil {
			return err
		}
		rs, err := NewRecurring(s.ids.NewID(), slot, typ, r)
		if err != nil {
			return err
		}
		if err := s.recurring.Create(ctx, rs); err != nil {
			return err
		}
		if err := recurringChanged(ctx, s.exports, rs.Slot, rs.ID); err != nil {
			return err
		}
		created, err = s.recurring.Get(ctx, rs.ID)
		return err
	})
	return created, err
}
