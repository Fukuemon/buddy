package schedule

import (
	"context"
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/tx"
)

// Update は、単発の予定の枠を in の内容に置き換える。
type Update struct {
	schedules Repository
	staff     StaffRefs
	locks     FacilityLock
	types     TypeRepository
	visits    VisitInfos
	now       func() time.Time
	exports   Exports
	tx        tx.Transactor
}

// NewUpdate は Update を作る。exports は、予定の変更を外部のカレンダーへの書き出しの待ちに積む。nil なら積まない。
// now は、退職した職員を割り振ったまま保存できる予定の日付を決める時刻である。nil なら time.Now を使う。
func NewUpdate(schedules Repository, staff StaffRefs, locks FacilityLock, types TypeRepository, visits VisitInfos, now func() time.Time, exports Exports, tx tx.Transactor) Update {
	if now == nil {
		now = time.Now
	}
	return Update{schedules: schedules, staff: staff, locks: locks, types: types, visits: visits, now: now, exports: exports, tx: tx}
}

// Do は、単発の予定の枠を in の内容に置き換え、書いた予定を返す。訪問の情報は in の内容で作り直し、前の訪問の情報は消す。
// 予定が見つからないときは apperr.ErrNotFound を、キャンセル済みのときは apperr.ErrConflict を、
// 参照が見つからないか別の事業所のものであるときは入力のエラーを返す。
func (s Update) Do(ctx context.Context, scheduleID string, in SlotInput) (Schedule, error) {
	var updated Schedule
	err := s.tx.WithinTx(ctx, func(ctx context.Context) error {
		cur, err := s.schedules.GetForUpdate(ctx, scheduleID)
		if err != nil {
			return err
		}
		if err := RequireScheduleAccess(ctx, s.staff, cur.StaffID, true); err != nil {
			return err
		}
		if cur.Cancelled {
			return apperr.Conflict("キャンセル済みの予定は変えられません")
		}
		slot, typ, err := prepareSlot(ctx, s.types, s.staff, s.locks, s.visits, s.now, cur.FacilityID, in, assignedOf(cur.StaffID, cur.Visit))
		if err != nil {
			return err
		}
		sc, err := New(cur.ID, slot, typ)
		if err != nil {
			return err
		}
		if err := s.schedules.Update(ctx, sc); err != nil {
			return err
		}
		if cur.VisitInfoID != nil {
			if err := s.visits.DeleteIfUnused(ctx, *cur.VisitInfoID); err != nil {
				return err
			}
		}
		// 職員が替わったときも、前の職員のカレンダーの予定は対応から消せるので、新しい職員で積む。
		if err := scheduleChanged(ctx, s.exports, sc.Slot, sc.ID); err != nil {
			return err
		}
		sc.RecurringScheduleID, sc.OriginalDate = cur.RecurringScheduleID, cur.OriginalDate
		updated = sc
		return nil
	})
	return updated, err
}
