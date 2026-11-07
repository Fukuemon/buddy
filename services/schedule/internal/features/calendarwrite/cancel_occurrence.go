package calendarwrite

import (
	"context"
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendar"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/schedule"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/scheduleview"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/staff"
	"github.com/Fukuemon/buddy/services/schedule/internal/kernel"
	"github.com/Fukuemon/buddy/services/schedule/internal/tx"
)

// CancelOccurrence は、google_primary の事業所の繰り返しの予定の 1 回を、Google カレンダーの回の予定を消して取り消す（ADR-0029）。
// Google は取り消した回を例外の回にし、親の予定の EXDATE は変えない。ほかの回は残る。
type CancelOccurrence struct {
	cancel Cancel
}

// NewCancelOccurrence は CancelOccurrence を作る。引数は NewCancel と同じである。
func NewCancelOccurrence(locks FacilityLock, cutovers Cutovers, staffRefs kernel.Finder[staff.Ref], visits VisitInfos, calendars Calendars,
	records RecordRepository, projections Projections, accounts calendar.Accounts, now func() time.Time, tx tx.Transactor) CancelOccurrence {
	return CancelOccurrence{cancel: NewCancel(locks, cutovers, staffRefs, visits, calendars, records, projections, accounts, now, tx)}
}

// Do は、事業所 facilityID の、一覧での ID が recurringScheduleID の繰り返しの予定の、元の規則で originalDate に始まる回を取り消し、
// 取り消しを返す。回は events.instances で Google から読み、読んだ回の etag を If-Match に付けて消す。保留の版は書かない（Cancel.Do と同じ）。
// 取り消しの ID は、回の一覧での ID（scheduleview.OccurrenceScheduleID）で、理由 reason は保存しない。
//
// 繰り返しの予定が無いか、繰り返しの予定でないときは apperr.ErrNotFound を、originalDate が回に当たらないか、その回を取り消したときは
// 入力のエラーを返す。その回をすでに変えたとき、親か回の記録に保留の版があるとき（CodeWritePending）は apperr.ErrConflict を返す。
// 回を読めないときは ErrGoogleUnavailable を包んだエラーを返す。ほかのエラーは Cancel.Do と同じである。
func (o CancelOccurrence) Do(ctx context.Context, facilityID, recurringScheduleID string, originalDate civil.Date, reason string) (schedule.Cancellation, error) {
	if _, err := schedule.NewCancellation(recurringScheduleID, recurringScheduleID, reason); err != nil {
		return schedule.Cancellation{}, err
	}
	return o.cancel.cancelOccurrence(ctx, facilityID, recurringScheduleID, originalDate, "", "", reason)
}

// cancelOccurrence は、CancelOccurrence.Do と、展開した回への Cancel.Do の取り消しを行う。etag が空でなければ、親の予定を読み直して
// etag と比べ、違うか、回が親の予定を展開した回から変わっていれば、回を消さない（listedInstance）。
// listID は、取り消す回の一覧での ID で、空なら回の OccurrenceScheduleID にする。回を移した後に元のカレンダーに残った回では、
// 一覧での ID（DetachedOccurrenceScheduleID）を渡す。回の記録が移した予定を指すので、残った回をすでに変えた回とみなさないためである。
func (c Cancel) cancelOccurrence(ctx context.Context, facilityID, recurringScheduleID string, originalDate civil.Date, listID, etag, reason string) (schedule.Cancellation, error) {
	if c.accounts == nil {
		return schedule.Cancellation{}, calendar.ErrNotConfigured
	}
	writer, err := c.accounts.Writer(ctx, facilityID)
	if err != nil {
		return schedule.Cancellation{}, err
	}
	source, err := c.accounts.Source(ctx, facilityID)
	if err != nil {
		return schedule.Cancellation{}, err
	}
	var parent parentEvent
	err = c.tx.WithinTx(ctx, func(ctx context.Context) error {
		if err := requireGooglePrimary(ctx, c.locks, c.cutovers, facilityID); err != nil {
			return err
		}
		parent, err = lockParent(ctx, c.records, c.projections, c.staffRefs, c.calendars, facilityID, recurringScheduleID)
		return err
	})
	if err != nil {
		return schedule.Cancellation{}, err
	}
	inst, err := listedInstance(ctx, source, c.projections, c.now, c.tx, parent, originalDate, etag)
	if err != nil {
		return schedule.Cancellation{}, err
	}
	id := listID
	if id == "" {
		id = scheduleview.OccurrenceScheduleID(parent.cal.ID, parent.row.EventID, originalDate)
	}
	err = c.tx.WithinTx(ctx, func(ctx context.Context) error {
		if err := requireGooglePrimary(ctx, c.locks, c.cutovers, facilityID); err != nil {
			return err
		}
		if _, err := lockParent(ctx, c.records, c.projections, c.staffRefs, c.calendars, facilityID, recurringScheduleID); err != nil {
			return err
		}
		return requireUnchanged(ctx, c.records, c.projections, facilityID, id)
	})
	if err != nil {
		return schedule.Cancellation{}, err
	}
	if err := c.remove(context.WithoutCancel(ctx), source, writer, id, parent.cal, inst.ID, inst.ETag); err != nil {
		return schedule.Cancellation{}, err
	}
	return schedule.NewCancellation(id, id, reason)
}
