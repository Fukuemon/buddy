package schedule

import (
	"context"
)

// CreateRecurring は、事業所に繰り返しの予定を作る。エラーは Create と同じである。
func (s *App) CreateRecurring(ctx context.Context, facilityID string, in SlotInput, rule RuleInput) (RecurringDetail, error) {
	if _, err := s.deps.Facilities.Get(ctx, facilityID); err != nil {
		return RecurringDetail{}, err
	}
	r, err := NewRule(Rule(rule))
	if err != nil {
		return RecurringDetail{}, err
	}
	var created RecurringDetail
	err = s.tx.WithinTx(ctx, func(ctx context.Context) error {
		slot, typ, err := s.prepareSlot(ctx, facilityID, in, assignment{})
		if err != nil {
			return err
		}
		rs, err := NewRecurring(s.ids.NewID(), slot, typ, r)
		if err != nil {
			return err
		}
		if err := s.deps.Recurring.Create(ctx, rs); err != nil {
			return err
		}
		if err := s.recurringChanged(ctx, rs.Slot, rs.ID); err != nil {
			return err
		}
		created, err = s.deps.Recurring.Get(ctx, rs.ID)
		return err
	})
	return created, err
}
