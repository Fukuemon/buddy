package schedule

import (
	"context"
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/kernel"
	"github.com/Fukuemon/buddy/services/schedule/internal/tx"
)

// ChangeOccurrence は、繰り返しの予定の originalDate の回を、in の内容の単発の予定に置き換える。
type ChangeOccurrence struct {
	recurring RecurringRepository
	staff     StaffRefs
	locks     FacilityLock
	schedules Repository
	types     TypeRepository
	visits    VisitInfos
	now       func() time.Time
	exports   Exports
	tx        tx.Transactor
	ids       kernel.IDGenerator
}

// NewChangeOccurrence は ChangeOccurrence を作る。exports は、予定の変更を外部のカレンダーへの書き出しの待ちに積む。nil なら積まない。
// now は、退職した職員を割り振ったまま保存できる予定の日付を決める時刻である。nil なら time.Now を使う。
func NewChangeOccurrence(recurring RecurringRepository, staff StaffRefs, locks FacilityLock, schedules Repository, types TypeRepository, visits VisitInfos, now func() time.Time, exports Exports, tx tx.Transactor, ids kernel.IDGenerator) ChangeOccurrence {
	if now == nil {
		now = time.Now
	}
	return ChangeOccurrence{recurring: recurring, staff: staff, locks: locks, schedules: schedules, types: types, visits: visits, now: now, exports: exports, tx: tx, ids: ids}
}

// Do は、繰り返しの予定の originalDate の回を、in の内容の単発の予定に置き換える。
// 元の回は繰り返しの予定から除外し、作った単発の予定を返す。繰り返しの予定の行は、トランザクションの最初にロックして読む。
// 繰り返しの予定が見つからないときは apperr.ErrNotFound を、originalDate が回に当たらないときは入力のエラーを、
// その回をすでに置き換えたときと、事業所が予定を buddy で管理していないとき（code は CodeGooglePrimary）は apperr.ErrConflict を返す。
func (s ChangeOccurrence) Do(ctx context.Context, recurringScheduleID string, originalDate civil.Date, in SlotInput) (Schedule, error) {
	var created Schedule
	err := s.tx.WithinTx(ctx, func(ctx context.Context) error {
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
		created, err = createSchedule(ctx, s.schedules, s.ids, s.types, s.staff, s.visits, s.now, s.exports, rs.FacilityID, in, &occurrence{recurringScheduleID: rs.ID, originalDate: originalDate, kept: assignedOf(rs.StaffID, rs.Visit)})
		if err != nil {
			return err
		}
		return recurringChanged(ctx, s.exports, rs.Slot, rs.ID)
	})
	return created, err
}
