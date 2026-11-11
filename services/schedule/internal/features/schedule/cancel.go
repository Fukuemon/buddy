package schedule

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/kernel"
	"github.com/Fukuemon/buddy/services/schedule/internal/tx"
)

// Cancel は、単発の予定をキャンセルする。
type Cancel struct {
	schedules Repository
	staff     StaffRefs
	locks     FacilityLock
	exports   Exports
	tx        tx.Transactor
	ids       kernel.IDGenerator
}

// NewCancel は Cancel を作る。exports は、予定の変更を外部のカレンダーへの書き出しの待ちに積む。nil なら積まない。
func NewCancel(schedules Repository, staff StaffRefs, locks FacilityLock, exports Exports, tx tx.Transactor, ids kernel.IDGenerator) Cancel {
	return Cancel{schedules: schedules, staff: staff, locks: locks, exports: exports, tx: tx, ids: ids}
}

// Do は、単発の予定をキャンセルする。予定が見つからないときは apperr.ErrNotFound を、
// キャンセル済みのときと、事業所が予定を buddy で管理していないとき（code は CodeGooglePrimary）は apperr.ErrConflict を返す。
func (s Cancel) Do(ctx context.Context, scheduleID, reason string) (Cancellation, error) {
	c, err := NewCancellation(s.ids.NewID(), scheduleID, reason)
	if err != nil {
		return Cancellation{}, err
	}
	// Update と同じ行のロックの中で権限を確認し、確認した後に予定の職員が替わらないようにする。
	err = s.tx.WithinTx(ctx, func(ctx context.Context) error {
		cur, err := s.schedules.GetForUpdate(ctx, scheduleID)
		if err != nil {
			return err
		}
		if err := lockWritable(ctx, s.locks, cur.FacilityID); err != nil {
			return err
		}
		if err := RequireScheduleAccess(ctx, s.staff, cur.StaffID, true); err != nil {
			return err
		}
		if err := apperr.AsConflict(s.schedules.CreateCancel(ctx, c), "この予定はすでにキャンセルされています"); err != nil {
			return err
		}
		return scheduleChanged(ctx, s.exports, cur.Slot, cur.ID)
	})
	if err != nil {
		return Cancellation{}, err
	}
	return c, nil
}
