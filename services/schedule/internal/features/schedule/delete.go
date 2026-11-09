package schedule

import (
	"context"
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/kernel"
	"github.com/Fukuemon/buddy/services/schedule/internal/tx"
)

// Deletion は、誤って入れた予定を削除した監査の記録である（ADR-0040）。消した時点の内容（訪問の情報と利用者）は持たない。
// 単発の予定の削除では ScheduleID を、繰り返しの予定の回の削除では RecurringScheduleID を持ち、もう一方は空である。
// Date は単発の予定の開始の日か、削除した回の日で、StaffID は予定の職員、DeletedBy は削除した職員である。時刻は保存するときに決まる。
type Deletion struct {
	ID                  string
	FacilityID          string
	ScheduleID          string
	RecurringScheduleID string
	Date                civil.Date
	StaffID             string
	DeletedBy           string
}

// requireDeletableDate は、開始の日 date の予定を削除できるかを確認する。照合が読む過去の予定を変えないため、
// 今日 today（Asia/Tokyo）より前の予定は入力のエラーにする。規則の変更の、今日より前の適用の日と同じ扱いである（ADR-0040）。
func requireDeletableDate(date, today civil.Date) error {
	if date.Before(today) {
		return apperr.Invalid("今日より前の予定は削除できません")
	}
	return nil
}

// Delete は、誤って入れた単発の予定を削除する（ADR-0040）。
type Delete struct {
	schedules Repository
	staff     StaffRefs
	locks     FacilityLock
	now       func() time.Time
	exports   Exports
	tx        tx.Transactor
	ids       kernel.IDGenerator
}

// NewDelete は Delete を作る。exports は、削除を外部のカレンダーへの書き出しの待ちに積む。nil なら積まない。
// now は、予定の開始の日と比べる今日を決める時刻である。nil なら time.Now を使う。
func NewDelete(schedules Repository, staff StaffRefs, locks FacilityLock, now func() time.Time, exports Exports, tx tx.Transactor, ids kernel.IDGenerator) Delete {
	if now == nil {
		now = time.Now
	}
	return Delete{schedules: schedules, staff: staff, locks: locks, now: now, exports: exports, tx: tx, ids: ids}
}

// Do は、単発の予定 scheduleID を監査の記録に移して消す。回を置き換えた予定を消しても、元の回の日は除外する日のまま残る。
// 予定が見つからないときは apperr.ErrNotFound を、開始の日が今日より前のときは入力のエラーを、
// キャンセル済みのときと、事業所が buddy を予定の正本にしていないとき（code は CodeGooglePrimary）は apperr.ErrConflict を返す。
func (s Delete) Do(ctx context.Context, scheduleID string) error {
	p, err := Current(ctx)
	if err != nil {
		return err
	}
	return s.tx.WithinTx(ctx, func(ctx context.Context) error {
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
		if cur.Cancelled {
			return apperr.Conflict("キャンセル済みの予定は削除できません")
		}
		if err := requireDeletableDate(cur.Date, civil.Today(s.now())); err != nil {
			return err
		}
		d := Deletion{ID: s.ids.NewID(), FacilityID: cur.FacilityID, ScheduleID: cur.ID, Date: cur.Date, StaffID: cur.StaffID, DeletedBy: p.Staff.ID}
		if err := s.schedules.Delete(ctx, d); err != nil {
			return err
		}
		if s.exports == nil {
			return nil
		}
		return s.exports.ScheduleDeleted(ctx, cur.FacilityID, cur.StaffID, cur.ID)
	})
}

// DeleteOccurrence は、誤って入れた繰り返しの予定の 1 回を削除する（ADR-0040）。
type DeleteOccurrence struct {
	recurring RecurringRepository
	staff     StaffRefs
	locks     FacilityLock
	now       func() time.Time
	exports   Exports
	tx        tx.Transactor
	ids       kernel.IDGenerator
}

// NewDeleteOccurrence は DeleteOccurrence を作る。exports と now は NewDelete と同じである。
func NewDeleteOccurrence(recurring RecurringRepository, staff StaffRefs, locks FacilityLock, now func() time.Time, exports Exports, tx tx.Transactor, ids kernel.IDGenerator) DeleteOccurrence {
	if now == nil {
		now = time.Now
	}
	return DeleteOccurrence{recurring: recurring, staff: staff, locks: locks, now: now, exports: exports, tx: tx, ids: ids}
}

// Do は、繰り返しの予定 recurringScheduleID の originalDate の回を除外する日に足し、監査の記録を残す。単発の予定は作らない。
// 書き出しの待ちには繰り返しの予定の変更を積み、その日を外部の予定の EXDATE にする。回のキャンセルと同じである。
// 置き換えた後の回は単発の予定なので、Delete で削除する。
// 繰り返しの予定が見つからないときは apperr.ErrNotFound を、回に当たらない日か今日より前の日のときは入力のエラーを、
// その回をすでに置き換えたか、キャンセルしたか、削除したときと、事業所が buddy を予定の正本にしていないとき（code は CodeGooglePrimary）は
// apperr.ErrConflict を返す。
func (s DeleteOccurrence) Do(ctx context.Context, recurringScheduleID string, originalDate civil.Date) error {
	p, err := Current(ctx)
	if err != nil {
		return err
	}
	return s.tx.WithinTx(ctx, func(ctx context.Context) error {
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
		if err := requireDeletableDate(originalDate, civil.Today(s.now())); err != nil {
			return err
		}
		d := Deletion{ID: s.ids.NewID(), FacilityID: rs.FacilityID, RecurringScheduleID: rs.ID, Date: originalDate, StaffID: rs.StaffID, DeletedBy: p.Staff.ID}
		if err := s.recurring.DeleteOccurrence(ctx, d); err != nil {
			return apperr.AsConflict(err, "%s の回はすでに置き換えたか、キャンセルしたか、削除しています", originalDate)
		}
		return recurringChanged(ctx, s.exports, rs.Slot, rs.ID)
	})
}
