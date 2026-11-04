package schedule

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
)

// Cancel は、単発の予定をキャンセルする。予定が見つからないときは apperr.ErrNotFound を、
// キャンセル済みのときは apperr.ErrConflict を返す。
func (s *App) Cancel(ctx context.Context, scheduleID, reason string) (Cancellation, error) {
	c, err := NewCancellation(s.ids.NewID(), scheduleID, reason)
	if err != nil {
		return Cancellation{}, err
	}
	// Update と同じ行のロックの中で権限を確認し、確認した後に予定の職員が替わらないようにする。
	err = s.tx.WithinTx(ctx, func(ctx context.Context) error {
		cur, err := s.deps.Schedules.GetForUpdate(ctx, scheduleID)
		if err != nil {
			return err
		}
		if err := s.requireScheduleAccess(ctx, cur.StaffID, true); err != nil {
			return err
		}
		if err := apperr.AsConflict(s.deps.Schedules.CreateCancel(ctx, c), "この予定はすでにキャンセルされています"); err != nil {
			return err
		}
		return s.scheduleChanged(ctx, cur.Slot, cur.ID)
	})
	if err != nil {
		return Cancellation{}, err
	}
	return c, nil
}
