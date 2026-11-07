package schedule

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/kernel"
	"github.com/Fukuemon/buddy/services/schedule/internal/tx"
)

// CancelOccurrence は、繰り返しの予定の 1 回をキャンセルする。
type CancelOccurrence struct {
	recurring RecurringRepository
	staff     StaffRefs
	locks     FacilityLock
	schedules Repository
	types     TypeRepository
	exports   Exports
	tx        tx.Transactor
	ids       kernel.IDGenerator
}

// NewCancelOccurrence は CancelOccurrence を作る。exports は、予定の変更を外部のカレンダーへの書き出しの待ちに積む。nil なら積まない。
func NewCancelOccurrence(recurring RecurringRepository, staff StaffRefs, locks FacilityLock, schedules Repository, types TypeRepository, exports Exports, tx tx.Transactor, ids kernel.IDGenerator) CancelOccurrence {
	return CancelOccurrence{recurring: recurring, staff: staff, locks: locks, schedules: schedules, types: types, exports: exports, tx: tx, ids: ids}
}

// Do は、繰り返しの予定の originalDate の回を、繰り返しの予定と同じ内容の単発の予定に置き換え、理由 reason でキャンセルする。
// 作る予定は繰り返しの予定の訪問の情報を指し、内容を変えないので、休職と退職の職員と利用の終了の利用者を確認しない。
// 書き出しの待ちには繰り返しの予定の変更だけを積む。キャンセルした予定は外部の予定と対応を持たず、回は除外する日で外部から消えるためである。
// エラーは ChangeOccurrence と同じで、理由が不正なときは入力のエラーを、その回をすでに置き換えたかキャンセルしたときは apperr.ErrConflict を返す。
func (s CancelOccurrence) Do(ctx context.Context, recurringScheduleID string, originalDate civil.Date, reason string) (Cancellation, error) {
	// 予定の ID はトランザクションの中で決まるので、理由だけを先に検証する
	c, err := NewCancellation(s.ids.NewID(), "", reason)
	if err != nil {
		return Cancellation{}, err
	}
	err = s.tx.WithinTx(ctx, func(ctx context.Context) error {
		rs, err := s.recurring.GetForUpdate(ctx, recurringScheduleID)
		if err != nil {
			return err
		}
		if err := lockWritable(ctx, s.locks, rs.FacilityID); err != nil {
			return err
		}
		if err := RequireScheduleAccess(ctx, s.staff, rs.StaffID, true); err != nil {
			return err
		}
		if !rs.HasOccurrenceOn(originalDate) {
			return apperr.Invalid("%s は繰り返しの予定の回に当たりません", originalDate)
		}
		if err := s.recurring.AddExclusion(ctx, rs.ID, originalDate); err != nil {
			return apperr.AsConflict(err, "%s の回はすでに置き換えられています", originalDate)
		}
		typ, err := s.types.Get(ctx, rs.TypeID)
		if err != nil {
			return err
		}
		slot := rs.Slot
		slot.Date = originalDate
		sc, err := New(s.ids.NewID(), slot, typ)
		if err != nil {
			return err
		}
		sc.RecurringScheduleID = &rs.ID
		sc.OriginalDate = &originalDate
		if err := s.schedules.Create(ctx, sc); err != nil {
			return err
		}
		c.ScheduleID = sc.ID
		if err := s.schedules.CreateCancel(ctx, c); err != nil {
			return err
		}
		return recurringChanged(ctx, s.exports, rs.Slot, rs.ID)
	})
	if err != nil {
		return Cancellation{}, err
	}
	return c, nil
}
